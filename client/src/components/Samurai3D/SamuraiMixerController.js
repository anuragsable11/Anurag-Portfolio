import * as THREE from 'three'
import { lag, spring } from './ik.js'
import { MOOD_TARGETS, STATES } from './poses.js'
import { clamp } from './util.js'

/**
 * Drives a rigged character that is not on the samurai rig (rig.js) from
 * its own animation clips, with the same interface as the procedural
 * controller (SamuraiAnimationController), so the engine, the page and the
 * public API work the same either way.
 *
 *  - IDLE loops. The named states (ATTENTION, DRAW_KATANA, STANCE,
 *    RETURN_IDLE) and moves (DRAW, SPIN, …) play once, crossfaded in and out
 *    of whatever is playing; a click runs the four states in turn.
 *  - Every switch starts the new clip from its first frame and crossfades
 *    into it over BLEND; however fast the switches come, no clip's share of
 *    the pose ever jumps (see fadeTo).
 *  - Effects cues fire at the same moments as on the built-in samurai: the
 *    glint as DRAW_KATANA ends, the impact as STANCE begins.
 *  - The gaze is layered onto the head bone after the mixer, as a rotation
 *    in world space (so the bone's own axes do not matter), small and on a
 *    spring.
 *  - Hover quickens the clips a little; reduced motion slows them, softens
 *    every crossfade and halves the gaze.
 *
 * Clip names are matched case-insensitively. Missing clips are skipped.
 */
const SEQUENCE = ['ATTENTION', 'DRAW_KATANA', 'STANCE', 'RETURN_IDLE']
// Crossfade lengths, in seconds of clip time (fade() stretches them for
// reduced motion).
const BLEND = 0.4 // into every move and cinematic step, and back to IDLE
const IMPACT_CUT = 0.12 // the cinematic's cut into STANCE lands on the impact flash, so it stays sharp
// Below this weight an action no longer shows: restarting it moves the
// pose by under a degree.
const SHOWING = 0.005

export function createMixerController({ model, camera, controls, canvas, cursor, orbit, clock, wake, onCue, onState }) {
  let rig = null
  let mixer = null
  const actions = new Map() // NAME → [action, twin once needed]
  const all = [] // every action, twins included: what a switch fades out
  let current = null
  let currentName = 'IDLE'
  let hold = false // the current clip stays on its last frame (transitionTo)
  let ended = false // the current clip reached its end in this mixer update
  let rising = null // a clip that carried on (see fadeTo), its weight rising frame by frame
  let sequence = null // remaining SEQUENCE steps of a click
  let calm = false
  let started = false
  let mood = 'calm'
  let reported = 'IDLE'
  const hover = { goal: 0, x: 0, v: 0 }
  const scroll = { goal: 0, x: 0, v: 0 }

  // (A bad duration from the page's API would otherwise poison every fade after it.)
  const fade = (seconds) => Math.max(0, seconds || 0) * (calm ? 1.6 : 1)

  // Each action's userData holds the fade it was last given, in mixer time:
  // weight w0 at t0 to w1 at t1. The mixer follows the same schedule, but
  // getEffectiveWeight() only reports it as of the last update, and two
  // switches can come in one frame (a move cut short by another at once).
  const weightAt = (f, t) => (t >= f.t1 ? f.w1 : f.w0 + ((f.w1 - f.w0) * Math.max(0, t - f.t0)) / (f.t1 - f.t0))
  // (A disabled action has faded out to nothing.)
  const weightNow = (action) => (action.enabled ? weightAt(action.userData, mixer.time) : 0)

  const ramp = (action, w0, w1, seconds) => {
    const f = action.userData
    f.w0 = w0
    f.w1 = w1
    f.t0 = mixer.time
    f.t1 = mixer.time + seconds
  }

  const addAction = (clip, name) => {
    const action = mixer.clipAction(clip)
    if (name !== 'IDLE') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    action.userData = { w0: 0, w1: 0, t0: 0, t1: 0, now: 0, fading: false }
    all.push(action)
    return action
  }

  /**
   * An action of `name` that does not show, to start from its first frame;
   * null if both it and its twin still show. reset() drops an action's fade
   * on the spot, so restarting one that still shows (the same move again,
   * or A→B→A in quick succession) would make its share of the pose vanish
   * in one frame: its twin takes the fresh start instead while it fades out
   * underneath. (userData.now: each action's weight, just read by fadeTo.)
   */
  const freshAction = (name) => {
    const pair = actions.get(name)
    for (const action of pair) if (action.userData.now < SHOWING) return action
    if (pair.length === 2) return null
    // The mixer keeps one action per clip, so the twin gets a second clip
    // over the same tracks: no keyframes are copied.
    const clip = pair[0].getClip()
    const twin = addAction(new THREE.AnimationClip(clip.name, clip.duration, clip.tracks, clip.blendMode), name)
    pair.push(twin)
    return twin
  }

  /**
   * Crossfades from whatever plays to `name`; false if there is no such clip.
   * `restart`: start it over even when it is what plays already (a move
   * played again); otherwise that carries on (IDLE, or a held state asked
   * for again).
   *
   * Everything that still shows fades out from the weight it has now, all
   * over the same time as the new clip fades in, so the weights keep adding
   * up to one. fadeOut() on its own ramps from full weight, so an action
   * caught halfway through its own fade would leap back up; and an older
   * action left on its shorter schedule would let the bind pose show
   * through (the mixer fills any weight below one with it).
   */
  const fadeTo = (name, seconds, restart = false) => {
    if (!actions.has(name)) return false
    if (restart || !current || currentName !== name) {
      const d = fade(seconds)
      for (const action of all) action.userData.now = weightNow(action)
      let next = freshAction(name)
      // Both instances still show (a third start inside one crossfade):
      // restarting either would jump, so one carries on where it is, and it
      // started moments ago anyway. One still playing beats one already at
      // its end; then the one most in view.
      const carry = !next
      if (carry) {
        const [a, b] = actions.get(name)
        next = a.paused !== b.paused ? (a.paused ? b : a) : a.userData.now >= b.userData.now ? a : b
      }
      rising = null
      let outgoing = null
      for (const action of all) {
        const f = action.userData
        f.fading = false
        if (action === next) continue
        if (f.now > 0) {
          // fadeOut() ramps from weight 1: scaled by the weight, it ramps from here.
          action.setEffectiveWeight(f.now)
          ramp(action, f.now, 0, d)
          f.fading = true
          if (!outgoing || f.now > outgoing.userData.now) outgoing = action
        } else if (f.w1 > 0) {
          // Started earlier this frame and not showing yet: called off.
          action.setEffectiveWeight(0)
          ramp(action, 0, 0, 0)
        }
      }
      if (carry) {
        // It rises from its weight to one as the rest fade. AnimationAction's
        // own fades only run up from zero (fadeIn) or down from one
        // (fadeOut), so update() sets this one's weight each frame. A clip
        // already at its end is let finish again, so whatever follows it
        // (IDLE, the next step) still does.
        next.paused = false
        next.setEffectiveWeight(d > 0 ? next.userData.now : 1)
        ramp(next, next.userData.now, 1, d)
        if (d > 0) rising = next
        for (const action of all) if (action.userData.fading) action.fadeOut(d)
      } else {
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play()
        if (outgoing) {
          next.crossFadeFrom(outgoing, d, false)
          for (const action of all) if (action.userData.fading && action !== outgoing) action.fadeOut(d)
          ramp(next, 0, 1, d)
        } else if (d > 0) {
          // Nothing to blend from (a model without IDLE): rise from the bind pose.
          next.fadeIn(d)
          ramp(next, 0, 1, d)
        } else ramp(next, 1, 1, 0)
      }
      current = next
    }
    currentName = name
    wake()
    return true
  }

  const nextInSequence = () => {
    while (sequence?.length) {
      const step = sequence.shift()
      if (step === 'STANCE') onCue?.('impact', 'cinematic')
      if (fadeTo(step, step === 'STANCE' ? IMPACT_CUT : BLEND, true)) return
    }
    sequence = null
    fadeTo('IDLE', BLEND)
  }

  const onFinished = (e) => {
    // Only the clip in charge moves things on: one still fading out under
    // it (twins included) may finish too, and is ignored.
    if (e.action === current) ended = true
  }

  // After the mixer's update in which the current clip ended, not from
  // inside it: a switch there would land midway through the mixer blending
  // the frame, with some actions already counted and the next clip given a
  // head start or not depending on where it sits in the mixer's list.
  const moveOn = () => {
    ended = false
    if (currentName === 'DRAW_KATANA') onCue?.('glint', 'cinematic')
    if (sequence) nextInSequence()
    // A held state (transitionTo) stays on its last frame.
    else if (!hold) fadeTo('IDLE', BLEND)
  }

  const playMove = (name) => {
    if (!started) return false
    sequence = null
    const key = name.toUpperCase()
    if (name === 'cinematic') {
      sequence = [...SEQUENCE]
      nextInSequence()
      return true
    }
    if (!actions.has(key)) return false
    hold = false
    return fadeTo(key, BLEND, key !== 'IDLE')
  }

  const transitionTo = (state, seconds = 0.6) => {
    if (!started) return false
    sequence = null
    if (state === 'IDLE' || state === 'RETURN_IDLE') return fadeTo('IDLE', seconds)
    if (!actions.has(state)) return false
    hold = true
    return fadeTo(state, seconds)
  }

  /* ---- The gaze ---- */
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane()
  const camDir = new THREE.Vector3()
  const hit = new THREE.Vector3()
  const headW = new THREE.Vector3()
  const to = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const rootQ = new THREE.Quaternion()
  const parentQ = new THREE.Quaternion()
  const delta = new THREE.Quaternion()
  const tmpQ = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const headBase = new THREE.Quaternion()
  let rect = null
  let rectAt = -1

  const updateLook = (dt) => {
    let goalYaw = 0
    let goalPitch = 0
    const head = rig.head
    if (head && cursor.active && !orbit.interacting) {
      if (clock.now - rectAt > 0.25) {
        rect = canvas.getBoundingClientRect()
        rectAt = clock.now
      }
      if (rect.width && rect.height) {
        ndc.set(
          clamp(((cursor.x - rect.left) / rect.width) * 2 - 1, -4, 4),
          clamp(-((cursor.y - rect.top) / rect.height) * 2 + 1, -4, 4)
        )
        raycaster.setFromCamera(ndc, camera)
        camera.getWorldDirection(camDir)
        hit.copy(camera.position).addScaledVector(camDir, camera.position.distanceTo(controls.target) * 0.5)
        plane.setFromNormalAndCoplanarPoint(camDir, hit)
        if (raycaster.ray.intersectPlane(plane, hit)) {
          head.getWorldPosition(headW)
          to.subVectors(hit, headW)
          rig.root.getWorldQuaternion(rootQ)
          forward.set(0, 0, 1).applyQuaternion(rootQ)
          right.set(1, 0, 0).applyQuaternion(rootQ)
          const along = to.dot(forward)
          const side = to.dot(right)
          const len = to.length() || 1
          const facing = THREE.MathUtils.smoothstep(along / len, -0.15, 0.45)
          goalYaw = clamp(Math.atan2(side, along), -0.5, 0.5) * facing
          goalPitch = clamp(-Math.atan2(to.y, Math.hypot(along, side)), -0.25, 0.25) * facing
        }
      }
    }
    const gain = calm ? 0.5 : 1
    let r = spring(look.yaw, look.vy, goalYaw * gain, calm ? 3 : 5, dt)
    look.yaw = r.x
    look.vy = r.v
    r = spring(look.pitch, look.vp, goalPitch * gain, calm ? 3 : 5, dt)
    look.pitch = r.x
    look.vp = r.v
  }

  const stateNow = () => {
    if (STATES.includes(currentName)) return currentName
    return currentName === 'IDLE' ? 'IDLE' : currentName
  }

  return {
    attach(next) {
      rig = next
      mixer = new THREE.AnimationMixer(rig.root)
      for (const clip of model.clips) {
        const name = clip.name.toUpperCase()
        actions.set(name, [addAction(clip, name)])
      }
      mixer.addEventListener('finished', onFinished)
      if (rig.head) headBase.copy(rig.head.quaternion)
      fadeTo('IDLE', 0)
    },
    update(dt) {
      const h = lag(hover, hover.goal, 7, dt)
      scroll.goal *= Math.exp(-6 * dt)
      lag(scroll, scroll.goal * (calm ? 0 : 1), 5, dt)
      const head = rig.head
      // The clips may not move the head: undo last frame's gaze first.
      if (head) head.quaternion.copy(headBase)
      const step = dt * (calm ? 0.6 : 1) * (1 + 0.15 * h)
      // A carried-on clip's rise (see fadeTo), at the time the mixer is about to show.
      if (rising) {
        const f = rising.userData
        rising.weight = weightAt(f, mixer.time + step)
        if (mixer.time + step >= f.t1) rising = null
      }
      mixer.update(step)
      if (ended) moveOn()
      if (head) {
        headBase.copy(head.quaternion)
        updateLook(dt)
        // The gaze as a world-space turn (yaw about up, pitch about his
        // right), carried into the head's parent space.
        rig.root.getWorldQuaternion(rootQ)
        right.set(1, 0, 0).applyQuaternion(rootQ)
        delta.setFromAxisAngle(Y, look.yaw).multiply(tmpQ.setFromAxisAngle(right, look.pitch + 0.05 * scroll.x))
        head.parent.getWorldQuaternion(parentQ)
        head.quaternion.premultiply(tmpQ.copy(parentQ).invert().multiply(delta).multiply(parentQ))
      }
      const eye = model.mats.eye
      if (eye.emissive) eye.emissiveIntensity = (eye.userData.baseIntensity ??= eye.emissiveIntensity) * (1 + 0.4 * h)
      const state = stateNow()
      if (state !== reported) {
        reported = state
        onState?.(state)
      }
    },
    toggleMeditation() {},
    standUp() {},
    setMood(next) {
      if (MOOD_TARGETS[next]) mood = next
    },
    playAction: playMove,
    transitionTo,
    play(name, { duration } = {}) {
      if (STATES.includes(name)) return transitionTo(name, duration)
      if (MOOD_TARGETS[name]) {
        mood = name
        return true
      }
      return playMove(name)
    },
    get state() {
      return reported
    },
    get performing() {
      return !!sequence || (STATES.includes(currentName) && currentName !== 'RETURN_IDLE' && currentName !== 'IDLE')
    },
    setHover(on) {
      hover.goal = on ? 1 : 0
      wake()
    },
    get hoverLevel() {
      return hover.x
    },
    setScroll(v) {
      scroll.goal = clamp(v, -1, 1)
    },
    noteActivity() {},
    get seated() {
      return 0
    },
    get still() {
      return calm ? 0 : 1
    },
    get mood() {
      return mood
    },
    get action() {
      return current && currentName !== 'IDLE'
        ? { name: currentName, u: +(current.time / current.getClip().duration).toFixed(2) }
        : null
    },
    setCalm(on) {
      calm = on
    },
    markStarted() {
      started = true
    },
  }
}
