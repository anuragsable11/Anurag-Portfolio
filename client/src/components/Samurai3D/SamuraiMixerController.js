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

export function createMixerController({ model, camera, controls, canvas, cursor, orbit, clock, wake, onCue, onState }) {
  let rig = null
  let mixer = null
  const actions = new Map()
  let current = null
  let currentName = 'IDLE'
  let sequence = null // remaining SEQUENCE steps of a click
  let calm = false
  let started = false
  let mood = 'calm'
  let reported = 'IDLE'
  const hover = { goal: 0, x: 0, v: 0 }
  const scroll = { goal: 0, x: 0, v: 0 }

  const fade = (seconds) => seconds * (calm ? 1.6 : 1)

  /** Crossfades from whatever plays to `name`; false if there is no such clip. */
  const fadeTo = (name, seconds) => {
    const next = actions.get(name)
    if (!next) return false
    if (next !== current) {
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play()
      if (current) current.crossFadeTo(next, fade(seconds), false)
    }
    current = next
    currentName = name
    wake()
    return true
  }

  const nextInSequence = () => {
    while (sequence?.length) {
      const step = sequence.shift()
      if (step === 'STANCE') onCue?.('impact', 'cinematic')
      if (fadeTo(step, step === 'STANCE' ? 0.12 : 0.25)) return
    }
    sequence = null
    fadeTo('IDLE', 0.45)
  }

  const onFinished = (e) => {
    if (e.action !== current) return
    if (currentName === 'DRAW_KATANA') onCue?.('glint', 'cinematic')
    if (sequence) nextInSequence()
    // A held state (transitionTo) stays on its last frame.
    else if (!current.userData?.hold) fadeTo('IDLE', 0.45)
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
    const action = actions.get(key)
    if (!action) return false
    action.userData = { hold: false }
    return fadeTo(key, 0.25)
  }

  const transitionTo = (state, seconds = 0.6) => {
    if (!started) return false
    sequence = null
    if (state === 'IDLE' || state === 'RETURN_IDLE') return fadeTo('IDLE', seconds)
    const action = actions.get(state)
    if (!action) return false
    action.userData = { hold: true }
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
        const action = mixer.clipAction(clip)
        const name = clip.name.toUpperCase()
        if (name !== 'IDLE') {
          action.setLoop(THREE.LoopOnce, 1)
          action.clampWhenFinished = true
        }
        actions.set(name, action)
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
      mixer.update(dt * (calm ? 0.6 : 1) * (1 + 0.15 * h))
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
