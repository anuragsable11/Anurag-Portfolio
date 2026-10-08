import * as THREE from 'three'
import {
  ANKLE_Y,
  FIRST_SIT_AT,
  FLOOR_CLEAR,
  GRIP_SPAN,
  HIP_X,
  HIP_Y,
  IDLE_SIT_AFTER,
  LEG_DROP,
  MEDITATE_FOR,
  PRONATE_MAX,
  SHIN,
  SHOULDER_X,
  SHOULDER_Y,
  STAND_FOR,
  THIGH,
  TRANSITION,
  UPPER_ARM,
  WRIST_MAX,
} from './constants.js'
import {
  footFloorY,
  inArmour,
  keepOutOfBody,
  lag,
  limitRotation,
  segmentDistance,
  setHeadPose,
  setObstacles,
  solveArm,
  solveLeg,
  spring,
  springVec,
} from './ik.js'
import {
  ACTIONS,
  CALM,
  GENTLE_ACTIONS,
  MOOD_TARGETS,
  REST,
  SCALARS,
  STATE_KEYS,
  STATES,
  bladeQuatInto,
  copyPose,
  makePose,
} from './poses.js'
import { clamp, keyframeCurve, lerp, smoothstep, smootherstep } from './util.js'

/**
 * Drives the built-in samurai's rig, every frame.
 *
 * He idles standing. Moods are whole-body poses (stance, arms via IK,
 * blade, eyes) that he eases between on springs; actions are keyframes
 * layered on top, from the pose he was in back to the one his mood calls
 * for, joined by a spline so a move flows through its keys. Between them he
 * breathes, blinks, glances about and shifts his weight, and his head (and
 * a little of his upper body) follows a mouse cursor.
 *
 * His feet are planted: the pelvis moves and the legs find it (IK), and
 * when a stance calls for a foot somewhere else he steps there, one foot
 * at a time, weight on the other. His wrist turns only as far as a wrist
 * can — the forearm rolls to carry the rest — and the point of the blade
 * never touches the floor. Hands and arms stay out of the armour. The
 * skirt, sode, bow and crest lag and flare from the body's real
 * acceleration; the front kusazuri lift with the thighs.
 *
 * The named animation states (poses.js STATES) are the click cinematic's
 * stretches — IDLE → ATTENTION → DRAW_KATANA → STANCE → RETURN_IDLE — and
 * can also be crossfaded to and held one at a time (transitionAnimation).
 * Hovering him raises his intensity a little; scrolling the page tips his
 * head and weight with it. Left alone for a long while (IDLE_SIT_AFTER), he
 * kneels into seiza the formal way — left foot back, left knee down, right
 * knee down, then back onto his heels as the feet lie flat — to meditate
 * with the katana across his lap, and rises the moment the visitor does
 * anything.
 *
 * Under reduced motion every change is slower and softer, idle motion is
 * down to breathing and blinks, and actions play a gentle form with no
 * quick moves (see poses.js gentleDef).
 *
 *   model     { mats, glowMat, eyeBase }: the materials he animates
 *             (the rig itself is attach()ed once it is built)
 *   camera, controls, canvas   for turning the cursor into a gaze
 *   cursor    { x, y, active, at }, kept current by the interaction layer
 *   orbit     { interacting }: the cursor-follow pauses during a drag
 *   clock     { now }: seconds on the loop's clock
 *   wake      restarts the render loop if it is paused
 *   onCue     (name, action) => void: an action reached a cue (effects)
 *   onState   (state) => void: the named state changed
 */
export function createAnimationController({
  model,
  camera,
  controls,
  canvas,
  cursor,
  orbit,
  clock,
  wake,
  onCue,
  onState,
}) {
  // The joints, once attach()ed.
  let samurai, legs, arms, panels, eyes, glows, tails, body, torso, cuirass, skirt, headRig
  let katana, saya, sayaStand, sayaSeated, crest, agemaki, eyeLight, sodeBaseQ
  const { mats, glowMat, eyeBase } = model

  let calmMotion = false
  let started = false

  /* ---- Meditation: `w` runs 0 (standing) → 1 (seated in seiza) ---- */
  // A long-idle behaviour: he kneels only once the visitor has done nothing
  // for IDLE_SIT_AFTER seconds, and rises as soon as they do something.
  const pose = { w: 0, from: 0, to: 0, start: -TRANSITION, next: IDLE_SIT_AFTER }
  // Wall-clock seconds: the loop clock stops while he is off screen, and
  // time spent reading elsewhere on the page is still the visitor active.
  const wallClock = () => performance.now() / 1000
  let lastActivity = wallClock()

  const toggleMeditation = () => {
    const now = clock.now
    pose.from = pose.w
    pose.to = pose.to ? 0 : 1
    pose.start = now
    pose.next = now + TRANSITION + (pose.to ? MEDITATE_FOR : STAND_FOR)
    wake()
  }
  const standUp = () => {
    if (pose.to === 1) toggleMeditation()
  }

  // Standing, the blade follows the mood; seated, it lies flat across the
  // lap, the point out past his left knee, held in body space.
  const katanaLap = bladeQuatInto(new THREE.Vector3(-0.99, 0, 0.12), new THREE.Vector3(0, 0, 1), new THREE.Quaternion())

  /* ---- Mood: springs carry the current pose toward the mood's pose ---- */
  let mood = 'calm'
  let target = MOOD_TARGETS.calm
  const cur = makePose()
  const vel = {
    s: Object.fromEntries(SCALARS.map((k) => [k, 0])),
    R: new THREE.Vector3(),
    L: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    edge: new THREE.Vector3(),
  }
  // What the mood and any action produce this frame, before idle motion.
  const out = makePose()
  const actionFrom = makePose()
  let action = null

  const followMood = (dt) => {
    // Reduced motion: the same easing, only slower and softer.
    const pace = calmMotion ? 0.42 : 1
    for (const k of SCALARS) {
      const r = spring(cur.s[k], vel.s[k], target.s[k], 5.5 * pace, dt)
      cur.s[k] = r.x
      vel.s[k] = r.v
    }
    springVec(cur.R, vel.R, target.R, 6 * pace, dt)
    springVec(cur.L, vel.L, target.L, 6 * pace, dt)
    springVec(cur.dir, vel.dir, target.dir, 5 * pace, dt)
    springVec(cur.edge, vel.edge, target.edge, 5 * pace, dt)
  }

  /** Starts a compiled action (poses.js compileAction) from wherever he is. */
  const begin = (def, name) => {
    standUp()
    // Start from wherever he is now, even mid-way through another action.
    copyPose(actionFrom, out)
    action = { def, name, start: clock.now, nextCue: 0 }
    micro.glance = micro.shift = null
    wake()
    return true
  }

  const startAction = (name) => {
    const def = (calmMotion ? GENTLE_ACTIONS : ACTIONS)[name]
    if (!def || !started) return false
    return begin(def, name)
  }

  /**
   * Crossfades to one named state over `duration` seconds and holds it;
   * IDLE (or RETURN_IDLE) eases back into the mood's own pose.
   */
  const transitionTo = (state, duration = 0.6) => {
    if (!started) return false
    const fade = Math.max(0.05, duration * (calmMotion ? 1.6 : 1))
    if (state === 'IDLE' || state === 'RETURN_IDLE') {
      if (!action) return true
      return begin({ duration: fade, spin: null, states: [['RETURN_IDLE', 0]], keys: [], hold: false }, 'RETURN_IDLE')
    }
    const key = STATE_KEYS[state]
    if (!key) return false
    return begin({ duration: fade, spin: null, states: [[state, 0]], keys: [key], hold: true }, state)
  }

  const setMood = (next) => {
    if (!MOOD_TARGETS[next] || next === mood) return
    const was = mood
    mood = next
    target = MOOD_TARGETS[next]
    if (next !== 'calm') standUp()
    else if (was !== 'calm') pose.next = Math.max(pose.next, clock.now + FIRST_SIT_AT)
    if (next === 'victory' && !action) startAction('hop')
    wake()
  }

  /* ---- Actions: a spline through the keys, from the pose he started in ---- */
  const curveT = new Float64Array(16)
  const curveP = new Array(16)
  // A key only sets what it names; anything else follows the mood.
  const scalarOf = (p, ch) => (p.partial && !(ch in p.s) ? cur.s[ch] : p.s[ch])
  const vectorOf = (p, name) => (p.partial ? p[name] || cur[name] : p[name])
  const evalAction = () => {
    const { def, start } = action
    let u = (clock.now - start) / def.duration
    // Cues (effects) fire as the timeline passes their key.
    while (action.nextCue < def.keys.length && def.keys[action.nextCue].t <= u) {
      const cue = def.keys[action.nextCue++].cue
      if (cue) onCue?.(cue, action.name)
    }
    if (u >= 1) {
      if (!def.hold) {
        action = null
        copyPose(out, cur)
        return
      }
      // A held state stays on its last key until something replaces it.
      u = 1
    }
    let n = 0
    curveT[n] = 0
    curveP[n++] = actionFrom
    for (const key of def.keys) {
      curveT[n] = key.t
      curveP[n++] = key
    }
    if (!def.hold && curveT[n - 1] < 1) {
      curveT[n] = 1
      curveP[n++] = cur
    }
    for (const ch of SCALARS) out.s[ch] = keyframeCurve(n, curveT, (i) => scalarOf(curveP[i], ch), u)
    for (const name of ['R', 'L', 'dir', 'edge']) {
      const v = out[name]
      for (const c of ['x', 'y', 'z']) v[c] = keyframeCurve(n, curveT, (i) => vectorOf(curveP[i], name)[c], u)
    }
  }

  /* ---- Idle life: blinks, glances, weight shifts, a grip adjustment ---- */
  const micro = {
    blinkAt: 1.5 + Math.random() * 2.5,
    blinkStart: -10,
    glanceAt: 6 + Math.random() * 4,
    glance: null,
    shiftAt: 9 + Math.random() * 5,
    shift: null,
    gripAt: 5,
    grip: null,
  }
  const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x))
  const envelope = (x, rise, fall) =>
    x <= 0 || x >= 1 ? 0 : THREE.MathUtils.smoothstep(x, 0, rise) * (1 - THREE.MathUtils.smoothstep(x, 1 - fall, 1))

  /* ---- Cursor: the head (and a little of the body) follows it ---- */
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
  const lookGoal = { yaw: 0, pitch: 0 }
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const lookPlane = new THREE.Plane()
  const camDir = new THREE.Vector3()
  const hit = new THREE.Vector3()
  const headW = new THREE.Vector3()
  const toCursor = new THREE.Vector3()

  // The canvas rectangle is measured a few times a second at most: reading
  // it every frame would force a layout while the page is animating.
  let rect = null
  let rectAt = -1
  const updateLook = (dt) => {
    const now = clock.now
    lookGoal.yaw = lookGoal.pitch = 0
    if (cursor.active && !orbit.interacting) {
      if (now - rectAt > 0.25) {
        rect = canvas.getBoundingClientRect()
        rectAt = now
      }
      if (rect.width && rect.height) {
        ndc.set(
          clamp(((cursor.x - rect.left) / rect.width) * 2 - 1, -4, 4),
          clamp(-((cursor.y - rect.top) / rect.height) * 2 + 1, -4, 4)
        )
        raycaster.setFromCamera(ndc, camera)
        // The cursor reads as a point floating between him and the viewer.
        camera.getWorldDirection(camDir)
        hit.copy(camera.position).addScaledVector(camDir, camera.position.distanceTo(controls.target) * 0.5)
        lookPlane.setFromNormalAndCoplanarPoint(camDir, hit)
        if (raycaster.ray.intersectPlane(lookPlane, hit)) {
          headRig.getWorldPosition(headW)
          samurai.worldToLocal(hit)
          samurai.worldToLocal(headW)
          toCursor.subVectors(hit, headW)
          const len = toCursor.length() || 1
          // Fade out when the cursor is behind him: he will not look backwards.
          const facing = THREE.MathUtils.smoothstep(toCursor.z / len, -0.15, 0.45)
          lookGoal.yaw = clamp(Math.atan2(toCursor.x, toCursor.z), -0.6, 0.6) * facing
          lookGoal.pitch = clamp(-Math.atan2(toCursor.y, Math.hypot(toCursor.x, toCursor.z)), -0.22, 0.3) * facing
        }
      }
    }
    const gain = calmMotion ? 0.5 : 1
    const omega = calmMotion ? 3 : 5
    let r = spring(look.yaw, look.vy, lookGoal.yaw * gain, omega, dt)
    look.yaw = r.x
    look.vy = r.v
    r = spring(look.pitch, look.vp, lookGoal.pitch * gain, omega, dt)
    look.pitch = r.x
    look.vp = r.v
  }

  /* ---- Hover and scroll: small, eased modifiers on whatever pose he is in ---- */
  const hover = { goal: 0, x: 0, v: 0 }
  const scroll = { goal: 0, x: 0, v: 0 }
  // This frame's pose scalars after the modifiers (never written back to
  // the pose itself, so actions always start from the plain pose).
  const view = { ...CALM }

  /* ---- The named state, reported when it changes ---- */
  const stateOf = () => {
    if (!action) return 'IDLE'
    const { states, duration } = action.def
    if (!states) return action.name.toUpperCase()
    const u = (clock.now - action.start) / duration
    let name = states[0][0]
    for (const [state, from] of states) if (u >= from) name = state
    return name
  }
  let reported = 'IDLE'

  /* ================================================================
     Legs: planted feet, steps, and the kneel
     ================================================================ */
  // The katana-side foot leads a stance.
  const SWORD_SIDE = 1
  // Each foot: where it is planted (figure space, on the floor), the step
  // under way if any, and how it is pitched (positive: toes down).
  const feet = [-1, 1].map((side) => ({
    side,
    x: side * (HIP_X + CALM.splay),
    z: 0,
    goal: new THREE.Vector3(),
    step: null,
    pitch: 0,
    lifted: 0,
    endedAt: -1,
  }))
  const STEP_AT = 0.03
  const legIK = { q: new THREE.Quaternion(), bend: 0, knee: new THREE.Vector3() }
  const hipPos = new THREE.Vector3()
  const anklePos = new THREE.Vector3()
  const footPole = new THREE.Vector3()
  const footQ = new THREE.Quaternion()
  const chainQ = new THREE.Quaternion()
  const thighLift = [0, 0]
  // Each leg's hip, knee and ankle in the figure's frame, and in the body's.
  const legJoints = [0, 1].map(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
  const legBody = [0, 1].map(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])

  // The formal kneel, as a function of how far in it is (0 standing, 1 in
  // seiza): the left foot steps back onto its toes, the left knee comes to
  // the floor, the right foot steps back beside it, then he sits back onto
  // his heels as both feet lie flat — and rises the same way in reverse.
  const KNEEL_TOE = 1.2
  const KNEEL_FLAT = 2.95
  // A knee on the floor sits this high (the cop and its trim below the joint).
  const KNEE_FLOOR = 0.23
  const KNEEL_HIP_LOW = KNEE_FLOOR + THIGH
  const SEIZA_HIP = HIP_Y - LEG_DROP - 0.49
  const kneelOut = { hipY: 0, rootZ: 0, legs: [new THREE.Vector4(), new THREE.Vector4()] }
  const phase = (p, a, b) => smoothstep(p, a, b)
  const kizaAnkle = (side, v) => {
    const y = footFloorY(KNEEL_TOE)
    return v.set(side * HIP_X, y, -Math.sqrt(Math.max(0, SHIN * SHIN - (y - KNEE_FLOOR) ** 2)), KNEEL_TOE)
  }
  // Lying flat, the ankle stays high enough that the shin's splints clear
  // the floor all the way along.
  const SHIN_FLOOR = 0.19
  const flatAnkle = (side, pitch, v) => {
    const y = Math.max(footFloorY(pitch), SHIN_FLOOR * smoothstep(pitch, KNEEL_TOE, KNEEL_FLAT) + footFloorY(pitch) * (1 - smoothstep(pitch, KNEEL_TOE, KNEEL_FLAT)))
    return v.set(side * HIP_X, y, -Math.sqrt(Math.max(0, SHIN * SHIN - (y - KNEE_FLOOR) ** 2)), pitch)
  }
  const kneelTmp = new THREE.Vector4()
  const kneelPose = (p, splay) => {
    const s0 = phase(p, 0, 0.25)
    const s1 = phase(p, 0.25, 0.5)
    const s2 = phase(p, 0.5, 0.75)
    const s3 = phase(p, 0.75, 1)
    const hipY = HIP_Y + (1.08 - HIP_Y) * s0 + (KNEEL_HIP_LOW - 1.08) * s1 + (SEIZA_HIP - KNEEL_HIP_LOW) * s3
    // Knees stay put on the floor while he sits back: the figure moves back.
    const kneeZ = hipY < KNEEL_HIP_LOW ? Math.sqrt(Math.max(0, THIGH * THIGH - (hipY - KNEE_FLOOR) ** 2)) : 0
    kneelOut.hipY = hipY
    kneelOut.rootZ = -kneeZ
    // Left foot (index 1): steps back, lands on its toes, lies flat at the end.
    const L = kneelOut.legs[1]
    if (p < 0.25) {
      kizaAnkle(1, kneelTmp)
      L.set(lerp(HIP_X + splay, kneelTmp.x, s0), lerp(ANKLE_Y, kneelTmp.y, s0) + 0.07 * Math.sin(Math.PI * s0), lerp(0, kneelTmp.z, s0), KNEEL_TOE * s0)
    } else flatAnkle(1, lerp(KNEEL_TOE, KNEEL_FLAT, s3), L)
    // Right foot (index 0): flat until the left knee is down, then the same.
    const R = kneelOut.legs[0]
    if (p < 0.5) R.set(-(HIP_X + splay), ANKLE_Y, 0, 0)
    else if (p < 0.75) {
      kizaAnkle(-1, kneelTmp)
      R.set(lerp(-(HIP_X + splay), kneelTmp.x, s2), lerp(ANKLE_Y, kneelTmp.y, s2) + 0.07 * Math.sin(Math.PI * s2), lerp(0, kneelTmp.z, s2), KNEEL_TOE * s2)
    } else flatAnkle(-1, lerp(KNEEL_TOE, KNEEL_FLAT, s3), R)
    return kneelOut
  }

  /**
   * Places the pelvis and solves both legs. Standing, the feet are planted
   * and step to where the stance wants them; in the air they tuck; kneeling
   * they follow the choreography. Returns the pelvis's sideways shift.
   */
  const placeLegs = (dt, t, kneel, w, stand, sway, P, still, shiftDir) => {
    const now = clock.now
    const lift = P.lift * stand
    const airborne = lift > 0.002
    let hipY
    let rootZ = 0
    let xShift = Math.sin(t * 0.5) * 0.012 * sway + shiftDir * 0.03
    const kp = kneel > 0.001 ? kneelPose(kneel, P.splay) : null
    hipY = HIP_Y - (1 - Math.cos(P.crouch)) * (THIGH + SHIN) * 0.9 + lift + Math.sin(t * 1.1) * 0.014 * sway
    // Up on the balls of the feet, he is taller by most of the heels' rise.
    hipY += 0.7 * (footFloorY(0.35 * P.heels * stand) - ANKLE_Y)
    // How high above a foot the hip joint can be: a little short of full
    // reach, so a knee never locks straight.
    const reachOf = (f) => {
      const dx = f.x - f.side * HIP_X - xShift
      const dz = f.z - rootZ
      return Math.sqrt(Math.max(0, (THIGH + SHIN) ** 2 * 0.985 - dx * dx - dz * dz))
    }
    // The pelvis can only be as high as the legs reach — eased, so the
    // limit never jolts.
    const capHips = (y) => {
      for (const f of feet) {
        const cap = footFloorY(f.pitch) + f.lifted + reachOf(f)
        const k = 0.02
        y = cap - k * Math.log(1 + Math.exp((cap - y) / k))
      }
      return y
    }
    const hipWanted = hipY
    if (kp) {
      // The kneel is measured from the standing pelvis — the height his
      // legs give him with both feet planted in the stance — so it begins
      // and ends exactly where standing does.
      const reachStand = Math.sqrt(Math.max(0, (THIGH + SHIN) ** 2 * 0.985 - P.splay * P.splay))
      const cap = ANKLE_Y + reachStand
      const standHip = cap - 0.02 * Math.log(1 + Math.exp((cap - hipY) / 0.02))
      hipY = standHip + (kp.hipY - HIP_Y)
      rootZ = kp.rootZ
    }

    // Where each foot should be, and where it is.
    let stepping = feet.find((f) => f.step)
    for (const f of feet) {
      f.goal.set(f.side * (HIP_X + P.splay), 0, (f.side === SWORD_SIDE ? 1 : -0.4) * P.stride)
      if (kp) {
        // The choreography has the foot; the plant keeps up, so no step is
        // owed when he is back on his feet.
        f.x = f.goal.x
        f.z = f.goal.z
        f.step = null
      } else if (airborne) {
        // In the air the feet drift toward the stance they will land in.
        const k = dt > 0 ? 1 - Math.exp(-8 * dt) : 1
        if (f.step) {
          const s = clamp((now - f.step.start) / f.step.dur, 0, 1)
          f.x = lerp(f.step.x, f.goal.x, smoothstep(s, 0, 1))
          f.z = lerp(f.step.z, f.goal.z, smoothstep(s, 0, 1))
          f.step = null
        }
        f.x += (f.goal.x - f.x) * k
        f.z += (f.goal.z - f.z) * k
      }
    }
    if (!kp && !airborne && !stepping) {
      // The foot farther from where the stance wants it steps first.
      let far = null
      let farBy = STEP_AT
      for (const f of feet) {
        const d = Math.hypot(f.goal.x - f.x, f.goal.z - f.z)
        if (d > farBy && now - f.endedAt > 0.12) {
          far = f
          farBy = d
        }
      }
      if (far) {
        far.step = { x: far.x, z: far.z, start: now, dur: clamp(0.16 + farBy * 0.4, 0.18, 0.36), h: 0.03 + 0.12 * farBy }
        stepping = far
      }
    }

    // Each foot's ankle in floor space, and its pitch.
    for (const f of feet) {
      const i = f.side < 0 ? 0 : 1
      if (kp) {
        const v = kp.legs[i]
        f.x = v.x
        f.z = v.z
        f.pitch = v.w
        f.lifted = v.y - footFloorY(v.w)
        continue
      }
      if (airborne) {
        // A foot leaves the floor only once the pelvis rises past what the
        // leg can reach — push-off runs straight into flight — then the toes
        // point and the knees tuck up under him as he rises.
        f.pitch = 0.9 * smoothstep(lift, 0.05, 0.5)
        const need = hipWanted - (footFloorY(f.pitch) + reachOf(f))
        const k = 0.02
        f.lifted = smoothstep(lift, 0.002, 0.04) * k * Math.log(1 + Math.exp(need / k)) + 0.35 * lift * smoothstep(lift, 0.1, 0.4)
        continue
      }
      if (f.step) {
        const s = clamp((now - f.step.start) / f.step.dur, 0, 1)
        const e = smoothstep(s, 0, 1)
        f.x = lerp(f.step.x, f.goal.x, e)
        f.z = lerp(f.step.z, f.goal.z, e)
        // The foot's lift starts and ends at rest (no kick at the ends).
        const arc = 0.5 - 0.5 * Math.cos(2 * Math.PI * s)
        f.pitch = 0.3 * arc
        f.lifted = f.step.h * arc
        // Weight over the standing foot while this one is in the air.
        xShift -= f.side * 0.025 * arc
        if (s >= 1) {
          f.step = null
          f.endedAt = now
        }
      } else {
        f.pitch = 0.35 * P.heels * stand
        f.lifted = 0
      }
    }

    if (!kp) hipY = capHips(hipY)

    const hipLocalY = HIP_Y - LEG_DROP * w
    samurai.position.set(xShift, hipY - hipLocalY, rootZ)

    legs.forEach(({ hip, knee, ankle, side }, i) => {
      const f = feet[i]
      hip.position.y = hipLocalY
      hipPos.set(side * HIP_X, hipLocalY, 0)
      anklePos.set(f.x - xShift, footFloorY(f.pitch) + f.lifted - samurai.position.y, f.z - rootZ)
      const yaw = side * 0.1
      footPole.set(Math.sin(yaw), 0, Math.cos(yaw))
      solveLeg(hipPos, anklePos, footPole, legIK)
      hip.quaternion.copy(legIK.q)
      knee.rotation.set(legIK.bend, 0, 0)
      // The foot: level with the floor (or pitched), toes a little out.
      chainQ.copy(legIK.q).multiply(knee.quaternion).invert()
      footQ.setFromAxisAngle(Y_AXIS, yaw).multiply(tmpQ.setFromAxisAngle(X_AXIS, f.pitch))
      ankle.quaternion.copy(chainQ).multiply(footQ)
      // How far the thigh swings forward, for the kusazuri over it.
      thighLift[i] = Math.max(0, Math.atan2(legIK.knee.z - hipPos.z, hipPos.y - legIK.knee.y))
      legJoints[i][0].copy(hipPos)
      legJoints[i][1].copy(legIK.knee)
      legJoints[i][2].copy(anklePos)
    })
  }

  /* ================================================================
     Arms: IK to the hands, the wrist, the free hand on the grip
     ================================================================ */
  const restShoulderQ = [-1, 1].map((side) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.16)))
  const ik = { q: new THREE.Quaternion(), bend: 0 }
  const armState = [0, 1].map(() => ({ swivel: 0, swivelV: 0, roll: 0, rollV: 0, spin: new THREE.Vector3(), primed: false }))
  // Seated, the katana hand holds the grip over his right thigh with the
  // blade flat across the lap, and the other hand rests on the blade over
  // his left thigh.
  const SEATED_HANDS = [new THREE.Vector3(-0.5, 0.16, 0.3), new THREE.Vector3(0.32, 0.1, 0.3)]
  // Forearm rolls to try for a hand, nearest neutral first.
  const ROLLS = Array.from({ length: 13 }, (_, i) => ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) / 6)
  const rHand = new THREE.Vector3()
  const lHand = new THREE.Vector3()
  const gripPoint = new THREE.Vector3()
  const bladeQ = new THREE.Quaternion()
  const edgeDir = new THREE.Vector3()
  const edgeV = new THREE.Vector3()
  const edgePrevV = new THREE.Vector3()
  const prevEdge = REST.edge.clone()
  // Down the middle of a kusazuri panel, in its hinge's frame: from just
  // under the hinge to the hem, which flares outward.
  const FLAP_TOP = new THREE.Vector3(0, -0.04, 0.02)
  const FLAP_HEM = new THREE.Vector3(0, -0.36, 0.2)
  const flapM = new THREE.Matrix4()
  const flapCaps = Array.from({ length: 6 }, () => [new THREE.Vector3(), new THREE.Vector3(), 0.06])
  const wakiCap = [new THREE.Vector3(), new THREE.Vector3(), 0.045]
  const wakiCaps = [wakiCap]
  const NO_CAPS = []
  let wakiHilt = null
  const handQ = new THREE.Quaternion()
  const elbowQ = new THREE.Quaternion()
  const tmpQ = new THREE.Quaternion()
  const tmpQ2 = new THREE.Quaternion()
  const tmpV = new THREE.Vector3()
  const wrist = { swing: new THREE.Quaternion() }
  // The free fist at rest: back of the hand outward, fingers curled.
  const FIST_REST_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const KNUCKLES_TO_EDGE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const ELBOW_AT = new THREE.Vector3(0, -UPPER_ARM, 0)
  const KATANA_AT = new THREE.Vector3(0.02, -0.4, 0.04)
  const GRIP_AT = new THREE.Vector3(0, -GRIP_SPAN, 0)
  const eyeHot = new THREE.Color('#ff4a2a')
  const eyeWarm = new THREE.Color('#fff1cf')
  const eyeTint = new THREE.Color()
  let breathPhase = 0

  /**
   * Bends an arm to its hand target and settles the wrist: of the rolls the
   * forearm can make (pronation, up to PRONATE_MAX), it takes the one that
   * leaves the wrist the least to turn, and the wrist turns the rest, up to
   * WRIST_MAX — so the hand ends up exactly as wanted whenever a wrist can
   * get there, and as near as one can when it cannot. `want` is the hand's wanted
   * orientation in body space, taken `blend` of the way from `rest`, the
   * hand's rest grip in the forearm's frame; `hand` is the object that
   * carries the hand (the katana, or the free fist). `clear`, if given, may
   * turn the hand's orientation in body space before it is used (the blade
   * keeping clear of the body). The hand then turns to it on a critically
   * damped spring: a wrist is quick, but never instantaneous. Returns the
   * hand's final orientation in body space (in handQ).
   */
  const settleArm = (i, targetHand, want, rest, hand, w, dt, blend = 1, clear = null) => {
    const { shoulder, elbow, side, sode } = arms[i]
    const state = armState[i]
    solveArm(targetHand, side, state, dt, ik)
    shoulder.quaternion.copy(ik.q)
    const bend = ik.bend
    // The forearm without its roll: the wanted hand relative to it.
    elbowQ.setFromEuler(tmpE.set(-bend, 0, 0, 'XZY'))
    handQ.copy(shoulder.quaternion).multiply(elbowQ)
    tmpQ.copy(handQ).invert().multiply(want) // the hand in the forearm's frame
    if (blend < 1) tmpQ.slerpQuaternions(rest, tmpQ, blend)
    // Seated, the hands lie where the lap pose puts them: no limits.
    const rollMax = lerp(PRONATE_MAX, Math.PI, w)
    let best = 0
    let bestScore = Infinity
    for (const r of ROLLS) {
      const roll = r * rollMax
      tmpQ2.setFromAxisAngle(Y_AXIS, roll).multiply(rest) // the rest grip, rolled
      const swing = 2 * Math.acos(Math.min(1, Math.abs(tmpQ.dot(tmpQ2))))
      const score = swing + 0.1 * Math.abs(roll) + 0.3 * Math.abs(roll - state.roll)
      if (score < bestScore) {
        bestScore = score
        best = roll
      }
    }
    // The forearm turns to its roll at a forearm's pace, on a spring.
    if (dt > 0) {
      const r = spring(state.roll, state.rollV, best, 13, dt)
      state.roll = r.x
      state.rollV = r.v
    } else state.roll = best
    const roll = state.roll
    tmpQ2.setFromAxisAngle(Y_AXIS, roll).multiply(rest)
    wrist.swing.copy(tmpQ).multiply(tmpQ2.invert()) // want = swing · rolled rest
    limitRotation(wrist.swing, lerp(WRIST_MAX, Math.PI, w))
    elbow.rotation.order = 'XZY'
    elbow.rotation.set(-bend, roll, 0)
    // hand = R(-roll) · swing · R(roll) · rest
    handGoal
      .setFromAxisAngle(Y_AXIS, -roll)
      .multiply(wrist.swing)
      .multiply(tmpQ.setFromAxisAngle(Y_AXIS, roll))
      .multiply(rest)
    if (clear) {
      // In body space, cleared, and back into the forearm's frame.
      forearmQ.copy(shoulder.quaternion).multiply(elbow.quaternion)
      handQ.copy(forearmQ).multiply(handGoal)
      clear(handQ, shoulder, elbow)
      handGoal.copy(forearmQ.invert()).multiply(handQ)
    }
    if (!state.primed || !(dt > 0)) {
      hand.quaternion.copy(handGoal)
      state.spin.set(0, 0, 0)
      state.primed = true
    } else springQuat(hand.quaternion, state.spin, handGoal, 28, dt)
    if (clear) {
      // The spring can carry the hand past a goal that was clear: where it
      // has, the obstacle stops it, as it would stop a real blade.
      forearmQ.copy(shoulder.quaternion).multiply(elbow.quaternion)
      handQ.copy(forearmQ).multiply(hand.quaternion)
      if (clear(handQ, shoulder, elbow)) {
        hand.quaternion.copy(forearmQ.invert()).multiply(handQ)
        state.spin.set(0, 0, 0)
      }
    }
    // The sode hang from the shoulder: they follow the arm only a little,
    // and fly outward through a spin or a leap.
    tmpQ.copy(shoulder.quaternion).invert().multiply(restShoulderQ[i])
    sode.quaternion.slerpQuaternions(IDENTITY, tmpQ, 0.8).multiply(sodeBaseQ[i])
    return handQ.copy(shoulder.quaternion).multiply(elbow.quaternion).multiply(hand.quaternion)
  }
  const tmpE = new THREE.Euler()
  const handGoal = new THREE.Quaternion()
  const forearmQ = new THREE.Quaternion()

  /**
   * Turns q toward goal on a critically damped spring (angular velocity
   * `spin`, in q's own frame), in small steps so it is stable at any frame
   * rate.
   */
  const springErr = new THREE.Quaternion()
  const springStep = new THREE.Quaternion()
  const springAxis = new THREE.Vector3()
  const springQuat = (q, spin, goal, omega, dt) => {
    const n = Math.max(1, Math.ceil((omega * dt) / 0.25))
    const h = dt / n
    for (let k = 0; k < n; k++) {
      springErr.copy(q).invert().multiply(goal)
      if (springErr.w < 0) springErr.set(-springErr.x, -springErr.y, -springErr.z, -springErr.w)
      const s = Math.sqrt(Math.max(0, 1 - springErr.w * springErr.w))
      const angle = 2 * Math.acos(clamp(springErr.w, -1, 1))
      if (s > 1e-6) springAxis.set(springErr.x / s, springErr.y / s, springErr.z / s).multiplyScalar(angle)
      else springAxis.set(0, 0, 0)
      spin.addScaledVector(springAxis, omega * omega * h).multiplyScalar(1 / (1 + 2 * omega * h))
      const turn = spin.length() * h
      if (turn > 1e-9) q.multiply(springStep.setFromAxisAngle(springAxis.copy(spin).normalize(), turn))
    }
    return q.normalize()
  }

  /* ---- The blade's last word: clear of the armour, the legs and the floor ---- */
  // Close enough together that no plate edge — the visor's lip is the
  // thinnest — fits between two of them.
  const BLADE_SAMPLES = Array.from({ length: 15 }, (_, i) => 0.36 + i * 0.077)
  const bladeOrigin = new THREE.Vector3()
  const clearDir = new THREE.Vector3()
  const clearTry = new THREE.Vector3()
  const clearA = new THREE.Vector3()
  const clearB = new THREE.Vector3()
  const clearAxis = new THREE.Vector3()
  const clearP = new THREE.Vector3()
  const clearQ = new THREE.Quaternion()
  const clearW = new THREE.Vector3()
  const clearing = { k: 0 }
  let floorBody = 0
  // How far below the body's origin the floor is, along the body's up, and
  // which way is up in the body (the body leans and turns).
  const upInBody = new THREE.Vector3()
  /** How many points along the blade are inside something (0: clear). */
  const bladeCost = (origin, d) => {
    let cost = 0
    for (const s of BLADE_SAMPLES) {
      clearP.copy(origin).addScaledVector(d, s)
      if (clearP.dot(upInBody) < floorBody + (s > 1.3 ? FLOOR_CLEAR : 0.05)) cost++
      else if (inArmour(clearP, 0.035)) cost++
      else
        for (const [hipB, kneeB, ankleB] of legBody)
          if (segmentDistance(clearP, hipB, kneeB) < 0.22 || segmentDistance(clearP, kneeB, ankleB) < 0.2) {
            cost++
            break
          }
    }
    return cost
  }
  /**
   * Turns the katana (orientation q in body space) the least it takes to
   * clear everything — or, where nothing small enough clears it, as far as
   * it comes out. Returns true if it turned it.
   */
  const clearBlade = (q, shoulder, elbow) => {
    const sword = arms[1]
    bladeOrigin
      .copy(KATANA_AT)
      .applyQuaternion(elbow.quaternion)
      .add(ELBOW_AT)
      .applyQuaternion(shoulder.quaternion)
      .add(clearW.set(sword.side * SHOULDER_X, SHOULDER_Y, 0))
    clearDir.copy(Y_AXIS).applyQuaternion(q)
    const start = bladeCost(bladeOrigin, clearDir)
    if (!start) return false
    // Two directions across the blade; try turns of growing size about
    // each of eight axes between them, the last one that worked first.
    clearA.copy(Math.abs(clearDir.y) < 0.9 ? Y_AXIS : X_AXIS).cross(clearDir).normalize()
    clearB.crossVectors(clearDir, clearA)
    let bestCost = start
    let bestK = -1
    let bestAngle = 0
    for (let angle = 0.07; angle <= 1.41; angle += 0.07) {
      for (let j = 0; j < 8; j++) {
        const k = (clearing.k + j) % 8
        const a = (k * Math.PI) / 4
        clearAxis.copy(clearA).multiplyScalar(Math.cos(a)).addScaledVector(clearB, Math.sin(a))
        clearTry.copy(clearDir).applyAxisAngle(clearAxis, angle)
        const cost = bladeCost(bladeOrigin, clearTry)
        if (cost < bestCost) {
          bestCost = cost
          bestK = k
          bestAngle = angle
          if (!cost) break
        }
      }
      if (!bestCost) break
    }
    if (bestK < 0) return false
    clearing.k = bestK
    const a = (bestK * Math.PI) / 4
    clearAxis.copy(clearA).multiplyScalar(Math.cos(a)).addScaledVector(clearB, Math.sin(a))
    q.premultiply(clearQ.setFromAxisAngle(clearAxis, bestAngle))
    return true
  }

  /* ---- Per-frame scratch ---- */
  const X_AXIS = new THREE.Vector3(1, 0, 0)
  const Y_AXIS = new THREE.Vector3(0, 1, 0)
  const Z_AXIS = new THREE.Vector3(0, 0, 1)
  const IDENTITY = new THREE.Quaternion()
  // Secondary motion: what the body did last frame (smoothed rates), and
  // a damped spring per hanging part that lags behind it.
  const dyn = {
    prevY: 0,
    vy: 0,
    ay: 0,
    prevLean: 0,
    leanRate: 0,
    prevHead: 0,
    headRate: 0,
    prevYaw: 0,
    yawRate: 0,
    flare: { x: 0, v: 0 },
    flapLean: { x: 0, v: 0 },
    sode: { x: 0, v: 0 },
    tail: { x: 0, v: 0 },
    crest: { x: 0, v: 0 },
    bow: { x: 0, v: 0 },
  }

  /* ---- One frame of animation ---- */
  const update = (dt, t) => {
    const now = clock.now
    const still = calmMotion ? 0 : 1

    // Meditation: he rises on his own in any mood, but only sits when calm,
    // unhovered, and after the visitor has been idle a long while.
    if (!calmMotion && !action) {
      if (pose.to === 1 && t >= pose.next) toggleMeditation()
      else if (
        pose.to === 0 &&
        mood === 'calm' &&
        hover.goal === 0 &&
        t >= pose.next &&
        wallClock() - lastActivity >= IDLE_SIT_AFTER
      ) {
        toggleMeditation()
      }
    }
    const k = clamp((t - pose.start) / TRANSITION, 0, 1)
    const w = (pose.w = lerp(pose.from, pose.to, smootherstep(k)))
    // The legs' choreography runs on the plain timeline; the rest eases.
    const kneel = lerp(pose.from, pose.to, k)
    const stand = 1 - w
    // Peaks mid-transition: he leans into the motion of sitting or rising.
    const effort = Math.sin(Math.PI * k) * Math.abs(pose.to - pose.from)

    followMood(dt)
    if (action) evalAction()
    else copyPose(out, cur)

    // Hovered, he is a little more alive: deeper breath, more sway, eyes
    // brighter and narrower, weight a touch lower. Scrolling tips his head
    // the way the page moves and his weight the other way.
    const h = lag(hover, hover.goal, 7, dt)
    scroll.goal *= Math.exp(-6 * dt)
    const sv = lag(scroll, scroll.goal * still, 5, dt)
    const P = view
    for (const key of SCALARS) P[key] = out.s[key]
    P.sway *= 1 + 0.45 * h
    P.breathDepth *= 1 + 0.35 * h
    P.breathRate *= 1 + 0.15 * h
    P.eyeGlow += 0.3 * h
    P.eyeOpen *= 1 - 0.08 * h
    P.eyeTilt += 0.04 * h
    P.crouch += 0.025 * h
    P.glint += 0.2 * h
    P.lean += 0.015 * h - 0.02 * sv
    P.headPitch += 0.06 * sv
    const sway = P.sway * stand * still

    /* Secondary motion, from how the body moved last frame */
    if (dt > 0) {
      const settleK = Math.min(1, dt * 25)
      const vy = (samurai.position.y - dyn.prevY) / dt
      dyn.ay += ((vy - dyn.vy) / dt - dyn.ay) * settleK
      dyn.vy = vy
      dyn.leanRate += ((body.rotation.x - dyn.prevLean) / dt - dyn.leanRate) * settleK
      dyn.headRate += ((headRig.rotation.x - dyn.prevHead) / dt - dyn.headRate) * settleK
      let turned = samurai.rotation.y + body.rotation.y - dyn.prevYaw
      turned = Math.atan2(Math.sin(turned), Math.cos(turned))
      dyn.yawRate += (turned / dt - dyn.yawRate) * settleK
    }
    dyn.prevY = samurai.position.y
    dyn.prevLean = body.rotation.x
    dyn.prevHead = headRig.rotation.x
    dyn.prevYaw = samurai.rotation.y + body.rotation.y
    // Falling (or the top of a leap) lets hanging cloth float outward; a
    // quick lean or turn leaves it behind for a moment.
    const flare = lag(dyn.flare, clamp(0.02 * Math.max(0, -dyn.ay), 0, 0.45) * still, 9, dt)
    const flapLean = lag(dyn.flapLean, clamp(0.3 * dyn.leanRate, -0.3, 0.3) * still, 9, dt)
    const sodeSwing = lag(dyn.sode, (0.5 * flare + clamp(0.06 * Math.abs(dyn.yawRate), 0, 0.5)) * still, 8, dt)
    const tailSwing = lag(
      dyn.tail,
      clamp(-0.4 * (dyn.leanRate + dyn.headRate), -0.25, 0.25) * still - 0.5 * flare,
      10,
      dt
    )
    const crestNod = lag(dyn.crest, clamp(-0.15 * dyn.headRate, -0.1, 0.1) * still, 12, dt)
    const bowSwing = lag(dyn.bow, clamp(0.35 * dyn.leanRate, -0.3, 0.3) * still - 0.6 * flare, 9, dt)
    crest.rotation.x = -0.28 + crestNod
    agemaki.rotation.x = bowSwing

    /* Idle life */
    let blink = 1
    let glanceYaw = 0
    let glancePitch = 0
    let shiftTilt = 0
    let shiftTwist = 0
    let shiftDir = 0
    let gripRoll = 0
    if (t >= micro.blinkAt) {
      micro.blinkStart = t
      micro.blinkAt = t + 2.6 + Math.random() * 4.2
    }
    blink = 1 - 0.92 * bump((t - micro.blinkStart) / 0.17)
    if (still) {
      const quietCursor = !cursor.active || t - cursor.at > 3
      if (!action && stand > 0.95 && quietCursor && t >= micro.glanceAt) {
        micro.glance = {
          start: t,
          yaw: (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.2),
          pitch: (Math.random() - 0.4) * 0.12,
        }
        micro.glanceAt = t + 7 + Math.random() * 6
      }
      if (micro.glance) {
        const g = envelope((t - micro.glance.start) / 1.8, 0.25, 0.3)
        glanceYaw = micro.glance.yaw * g
        glancePitch = micro.glance.pitch * g
        if (t - micro.glance.start > 1.8) micro.glance = null
      }

      // A weight shift: the hips move over one foot, the body settles with them.
      if (!action && stand > 0.95 && t >= micro.shiftAt) {
        micro.shift = { start: t, dir: Math.random() < 0.5 ? -1 : 1 }
        micro.shiftAt = t + 9 + Math.random() * 6
      }
      if (micro.shift) {
        const g = envelope((t - micro.shift.start) / 2.6, 0.35, 0.4)
        shiftDir = micro.shift.dir * g
        shiftTilt = micro.shift.dir * 0.018 * g
        shiftTwist = micro.shift.dir * 0.03 * g
        if (t - micro.shift.start > 2.6) micro.shift = null
      }

      // A guard is never quite still: the grip resettles now and then.
      if (!action && P.twoHand > 0.5 && t >= micro.gripAt) {
        micro.grip = { start: t, dir: Math.random() < 0.5 ? -1 : 1 }
        micro.gripAt = t + 4 + Math.random() * 4
      }
      if (micro.grip) {
        gripRoll = micro.grip.dir * 0.08 * bump((t - micro.grip.start) / 0.6)
        if (t - micro.grip.start > 0.6) micro.grip = null
      }
    }
    updateLook(dt)
    const lookYaw = look.yaw * P.lookGain
    const lookPitch = look.pitch * P.lookGain

    /* Legs and pelvis: the feet stay where they are planted */
    placeLegs(dt, t, kneel, w, stand, sway, P, still, shiftDir * stand)
    saya.quaternion.slerpQuaternions(sayaStand, sayaSeated, THREE.MathUtils.smoothstep(w, 0, 0.6))
    samurai.rotation.z = Math.sin(t * 0.5) * 0.01 * sway
    // A whirlwind turns the whole figure; a full turn ends where it began.
    let turn = 0
    if (action?.def.spin) {
      const [from, to, angle] = action.def.spin
      turn = smootherstep(clamp(((now - action.start) / action.def.duration - from) / (to - from), 0, 1)) * angle
    }
    samurai.rotation.y = turn

    /* Body: lean, turn, breathing, armour that settles with it */
    const bodyYaw = Math.sin(t * 0.42) * 0.045 * sway + (P.twist + shiftTwist + lookYaw * 0.2) * stand
    body.rotation.set(0.04 * w + effort * 0.22 + P.lean * stand, bodyYaw, (P.tilt + shiftTilt) * stand)

    breathPhase += dt * P.breathRate
    const breathe = Math.sin(breathPhase) * P.breathDepth * stand * (calmMotion ? 0.6 : 1)
    const deep = Math.sin(t * 1.0)
    torso.scale.set(1, 1 + breathe + deep * 0.028 * w, 1)
    cuirass.scale.set(1 + breathe * 0.4, 1, 0.74 * (1 + breathe * 0.4))
    skirt.rotation.set(-P.lean * stand * 0.75, Math.sin(t * 0.42) * 0.03 * sway, 0)
    panels.forEach(({ flap, spread, facing, side: panelSide }, i) => {
      // The front and side panels ride up on whichever thigh swings forward
      // beneath them; seated, they fan out as authored.
      const near = facing > 0 ? lerp(thighLift[0], thighLift[1], 0.5 + 0.5 * panelSide) : 0
      flap.rotation.x =
        -spread * w -
        stand * 0.85 * near -
        Math.sin(t * 1.3 + i * 1.7) * 0.012 * sway -
        flare +
        flapLean * facing
    })
    tails.forEach((tail, i) => {
      tail.rotation.x = Math.sin(t * 1.2 + i * 0.8) * 0.1 * sway + 0.35 * w + tailSwing
    })

    /* Head: the head is on the body now, so it steadies against the body's turn */
    const wander = P.wander * still
    const headYaw =
      lookYaw + P.headYaw + glanceYaw + Math.sin(t * 0.37) * 0.14 * wander + Math.sin(t * 0.33) * 0.03 * still
    headRig.rotation.set(
      (P.headPitch + lookPitch + glancePitch + Math.sin(t * 0.23 + 1) * 0.05 * wander - P.lean * 0.55) * stand +
        (0.13 + deep * 0.025) * w,
      (headYaw - bodyYaw * 0.7) * stand,
      P.headTilt * stand + Math.sin(t * 0.47) * 0.016 * sway
    )

    /* The blade, in body space: where the pose points it, swaying a little */
    // Where the edge is meant to face can run nearly along the blade as it
    // swings; there the edge carries on as it was, so the blade never rolls
    // over in a frame.
    edgeDir.copy(out.dir).normalize()
    edgeV.copy(out.edge).addScaledVector(edgeDir, -out.edge.dot(edgeDir))
    edgePrevV.copy(prevEdge).addScaledVector(edgeDir, -prevEdge.dot(edgeDir))
    edgeV.addScaledVector(edgePrevV, 2 * (1 - smoothstep(edgeV.length(), 0.08, 0.45)))
    bladeQuatInto(out.dir, edgeV, bladeQ)
    prevEdge.copy(X_AXIS).applyQuaternion(bladeQ)
    bladeQ.premultiply(tmpQ.setFromAxisAngle(X_AXIS, Math.sin(t * 0.9) * 0.03 * sway))
    if (gripRoll) bladeQ.multiply(tmpQ.setFromAxisAngle(Y_AXIS, gripRoll))
    const kw = THREE.MathUtils.smoothstep(w, 0, 0.55)
    if (kw > 0) bladeQ.slerp(tmpQ.copy(body.quaternion).invert().multiply(katanaLap), kw)

    /* The katana hand: never through the armour */
    rHand.copy(out.R)
    rHand.z += Math.sin(t * 1.05 + 1) * 0.03 * sway
    keepOutOfBody(rHand, 0.11)

    /* What the blade must clear, in body space: the legs as they stand, the floor */
    body.updateMatrix()
    tmpQ.copy(body.quaternion).invert()
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 3; j++)
        legBody[i][j].copy(legJoints[i][j]).sub(tmpV.set(0, HIP_Y, 0)).applyQuaternion(tmpQ)
    upInBody.copy(Y_AXIS).applyQuaternion(tmpQ)
    floorBody = -(samurai.position.y + HIP_Y)
    setHeadPose(headRig.quaternion)
    // The kusazuri as they hang this frame: a capsule down each panel.
    skirt.updateMatrix()
    for (let i = 0; i < panels.length; i++) {
      const { flap } = panels[i]
      const hinge = flap.parent
      hinge.updateMatrix()
      flap.updateMatrix()
      flapM.multiplyMatrices(skirt.matrix, hinge.matrix).multiply(flap.matrix)
      const [a, b] = flapCaps[i]
      a.copy(FLAP_TOP).applyMatrix4(flapM)
      b.copy(FLAP_HEM).applyMatrix4(flapM)
    }
    // The wakizashi's hilt, wherever the scabbard has swung it.
    if (wakiHilt) {
      saya.updateMatrix()
      wakiCap[0].copy(wakiHilt[0]).applyMatrix4(saya.matrix)
      wakiCap[1].copy(wakiHilt[1]).applyMatrix4(saya.matrix)
    }
    setObstacles(flapCaps, wakiHilt ? wakiCaps : NO_CAPS)

    /* The katana arm, then the wrist; the blade's final orientation follows */
    if (w > 0) rHand.lerp(SEATED_HANDS[1], w)
    settleArm(1, rHand, bladeQ, REST.grip, katana, w, dt, 1, clearBlade)
    // The grip, in body space, from the arm as it is now.
    const sword = arms[1]
    gripPoint
      .copy(GRIP_AT)
      .applyQuaternion(katana.quaternion)
      .add(KATANA_AT)
      .applyQuaternion(sword.elbow.quaternion)
      .add(ELBOW_AT)
      .applyQuaternion(sword.shoulder.quaternion)
      .add(tmpV.set(SHOULDER_X, SHOULDER_Y, 0))
    mats.steel.envMapIntensity = 2.4 + P.glint * 1.6

    /* The free hand: round the body to the grip as the other joins it, else as posed */
    lHand.copy(out.L)
    lHand.z += Math.sin(t * 1.05 - 1) * 0.03 * sway
    const hold = clamp(P.twoHand, 0, 1)
    if (hold > 0) aroundBody(lHand, gripPoint, hold, lHand)
    if (w > 0) lHand.lerp(SEATED_HANDS[0], w)
    keepOutOfBody(lHand, 0.11)
    const freeHand = arms[0].hand
    if (freeHand) {
      // Closed on the grip, knuckles toward the edge; at rest, a loose fist.
      wantFree.copy(handQ).multiply(KNUCKLES_TO_EDGE)
      settleArm(0, lHand, wantFree, FIST_REST_Q, freeHand, w, dt, hold * stand)
    } else {
      const { shoulder, elbow, sode } = arms[0]
      solveArm(lHand, -1, armState[0], dt, ik)
      shoulder.quaternion.copy(ik.q)
      elbow.rotation.set(-ik.bend, 0, 0)
      tmpQ.copy(shoulder.quaternion).invert().multiply(restShoulderQ[0])
      sode.quaternion.slerpQuaternions(IDENTITY, tmpQ, 0.8).multiply(sodeBaseQ[0])
    }
    for (const { sode, side } of arms) sode.quaternion.multiply(tmpQ.setFromAxisAngle(Z_AXIS, side * sodeSwing))

    /* Eyes: open, tilt, glow and colour carry most of the emotion */
    const glowLevel = lerp(P.eyeGlow + Math.sin(t * 0.85) * 0.1 * still, 0.45 + deep * 0.3, w)
    mats.eye.emissiveIntensity = glowLevel
    glowMat.opacity = glowLevel * 0.55
    eyeTint.copy(eyeBase).lerp(P.heat >= 0 ? eyeHot : eyeWarm, Math.min(Math.abs(P.heat), 1))
    mats.eye.color.copy(eyeTint)
    mats.eye.emissive.copy(eyeTint)
    glowMat.color.copy(eyeTint)
    eyeLight.color.copy(eyeTint)
    eyeLight.intensity = glowLevel * 0.06
    const open = P.eyeOpen * blink
    eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1
      eye.scale.y = lerp(open * (1 + Math.sin(t * 0.85 + i) * 0.03 * still), 0.3, w)
      eye.rotation.z = side * lerp(P.eyeTilt, 0.06, w)
      glows[i].scale.y = lerp(0.6 + 0.4 * open, 0.55, w)
      glows[i].rotation.z = eye.rotation.z
    })

    const state = stateOf()
    if (state !== reported) {
      reported = state
      onState?.(state)
    }
  }

  const wantFree = new THREE.Quaternion()

  /**
   * A hand's path from `a` to `b` at fraction k, swung round the body
   * instead of through it: the angle about the body's axis and the distance
   * from it are eased separately, bulging outward a little on the way.
   */
  const aroundBody = (a, b, k, out) => {
    const fa = Math.atan2(a.x, a.z)
    const fb = Math.atan2(b.x, b.z)
    let df = fb - fa
    df = Math.atan2(Math.sin(df), Math.cos(df))
    const f = fa + df * k
    const r = lerp(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z), k) + 0.06 * Math.sin(Math.PI * k)
    const y = lerp(a.y, b.y, k)
    return out.set(Math.sin(f) * r, y, Math.cos(f) * r)
  }

  return {
    /** Binds the rig (see SamuraiModel's build()); update() needs it. */
    attach(rig) {
      ;({
        root: samurai,
        legs,
        arms,
        panels,
        eyes,
        glows,
        tails,
        body,
        torso,
        cuirass,
        skirt,
        headRig,
        katana,
        saya,
        sayaStand,
        sayaSeated,
        crest,
        agemaki,
        eyeLight,
        sodeBaseQ,
      } = rig)
      wakiHilt = rig.wakizashiHilt || null
      // Which side of him each kusazuri panel hangs on (+1 the katana side).
      for (const p of panels) {
        const hinge = p.flap.parent
        p.side = Math.sign(Math.round(hinge.position.x * 100)) || 0
      }
    },
    update,
    toggleMeditation,
    standUp,
    setMood,
    playAction: startAction,
    transitionTo,
    /**
     * Plays anything by name: a named state (crossfaded to and held), a
     * mood, or an action such as 'cinematic', 'draw' or 'bow'.
     */
    play(name, { duration } = {}) {
      if (STATES.includes(name)) return transitionTo(name, duration)
      if (MOOD_TARGETS[name]) {
        setMood(name)
        return true
      }
      return startAction(name)
    },
    /** The named state now: one of STATES, or a plain action's name in capitals. */
    get state() {
      return reported
    },
    /** True while the click cinematic is still building (before it lets go). */
    get performing() {
      return !!action && action.def.states !== null && reported !== 'RETURN_IDLE' && reported !== 'IDLE'
    },
    setHover(on) {
      hover.goal = on ? 1 : 0
      wake()
    },
    /** The eased hover level, 0..1. */
    get hoverLevel() {
      return hover.x
    },
    /** Page scroll velocity, roughly -1..1 (positive: scrolling down). */
    setScroll(v) {
      scroll.goal = clamp(v, -1, 1)
      wake()
    },
    /** The visitor did something: he will not sit, and rises if seated. */
    noteActivity() {
      lastActivity = wallClock()
      standUp()
    },
    /** How far into seiza he is, 0 (standing) to 1 (seated). */
    get seated() {
      return pose.w
    },
    /** 0 under reduced motion, else 1. */
    get still() {
      return calmMotion ? 0 : 1
    },
    get mood() {
      return mood
    },
    get action() {
      return action ? { name: action.name, u: +((clock.now - action.start) / action.def.duration).toFixed(2) } : null
    },
    /** Reduced motion: slower, softer easing, gentle actions, no idle sway. */
    setCalm(on) {
      calmMotion = on
      if (on) standUp()
    },
    /** Called once he is on screen; actions are ignored until then. */
    markStarted() {
      started = true
    },
  }
}
