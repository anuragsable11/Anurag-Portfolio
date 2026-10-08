import * as THREE from 'three'
import { ANKLE_Y, BOOT, FOREARM, SHIN, SHOULDER_X, SHOULDER_Y, THIGH, UPPER_ARM } from './constants.js'

/**
 * The rig's physics: the armour as an obstacle the hands and arms stay out
 * of, two-bone IK for the arms (which know where the body is) and the legs
 * (which know where the floor is), the wrist's swing-and-twist split, and
 * the critically damped spring every eased value in the character rides on.
 */

const clamp = THREE.MathUtils.clamp

/* ================================================================
   The armour as an obstacle
   ================================================================ */
// Measured off the built model, in body space (origin at the hips): for each
// height, the half-width of everything he wears, and how far it reaches
// forward and back. Boots and shins at the bottom, the kusazuri's flare at
// the hips, the dō, then the mask and the helmet — whose brim, neck guard
// and turned-back wings are nearly twice as wide as the body.
const HULL_Y0 = -1.125
const HULL_STEP = 0.05
const HULL = [
  [0.5, 0.39, -0.19], // -1.125 boots
  [0.5, 0.39, -0.19],
  [0.51, 0.39, -0.19],
  [0.5, 0.38, -0.18],
  [0.45, 0.25, -0.17], // -0.925 ankles
  [0.5, 0.21, -0.17],
  [0.5, 0.21, -0.17],
  [0.5, 0.21, -0.17],
  [0.51, 0.21, -0.17], // -0.725 knees
  [0.51, 0.21, -0.17],
  [0.51, 0.21, -0.17],
  [0.51, 0.21, -0.17],
  [0.52, 0.21, -0.17], // -0.525 thighs
  [0.53, 0.3, -0.3],
  [0.54, 0.41, -0.41], // -0.425 kusazuri hem
  [0.54, 0.42, -0.42],
  [0.52, 0.4, -0.4],
  [0.51, 0.39, -0.39],
  [0.49, 0.38, -0.38],
  [0.48, 0.37, -0.37],
  [0.47, 0.36, -0.36],
  [0.46, 0.35, -0.35],
  [0.45, 0.34, -0.34], // -0.025 the sash
  [0.42, 0.33, -0.33],
  [0.42, 0.34, -0.3],
  [0.43, 0.35, -0.3],
  [0.42, 0.35, -0.3],
  [0.47, 0.38, -0.42], // 0.225 the dō's lower lames
  [0.46, 0.35, -0.43],
  [0.46, 0.35, -0.37],
  [0.46, 0.35, -0.34],
  [0.45, 0.34, -0.34],
  [0.45, 0.34, -0.34],
  [0.45, 0.34, -0.33],
  [0.45, 0.33, -0.38],
  [0.46, 0.36, -0.4],
  [0.45, 0.34, -0.4],
  [0.45, 0.34, -0.38], // 0.725 the muna-ita
  [0.5, 0.33, -0.37],
  [0.59, 0.37, -0.37], // 0.825 the mask's chin and throat guard
  [0.72, 0.41, -0.39],
  [0.77, 0.44, -0.41],
  [0.77, 0.5, -0.42],
  [0.76, 0.5, -0.6], // 1.025 the helmet's bowl and neck guard
  [0.73, 0.46, -0.83],
  [0.8, 0.46, -0.91],
  [0.9, 0.46, -0.89],
  [0.93, 0.45, -0.85], // 1.225 the fukigaeshi
  [0.8, 0.51, -0.83],
  [0.8, 0.39, -0.8],
  [0.8, 0.78, -0.77], // 1.375 the peak
  [0.74, 0.77, -0.74],
  [0.7, 0.65, -0.7],
  [0.69, 0.66, -0.59], // 1.525 the bowl, up to its crown
  [0.59, 0.665, -0.59],
  [0.58, 0.66, -0.58],
  [0.55, 0.62, -0.55],
  [0.535, 0.585, -0.535],
  [0.51, 0.57, -0.51],
  [0.48, 0.556, -0.48],
  [0.4, 0.42, -0.4],
  [0.25, 0.27, -0.25],
  [0.1, 0.1, -0.1],
]

const band = [0, 0, 0]
/**
 * The hull at height y: [half-width, reach forward, reach back] — the larger
 * of the two bands around y, so a thin edge (the visor's lip) is never lost
 * between them.
 */
function hullAt(y) {
  const f = (y - HULL_Y0) / HULL_STEP
  const k = clamp(Math.floor(f), 0, HULL.length - 2)
  const a = HULL[k]
  const b = HULL[k + 1]
  band[0] = Math.max(a[0], b[0])
  band[1] = Math.max(a[1], b[1])
  band[2] = Math.min(a[2], b[2])
  return band
}

/**
 * How far p is from the body's axis in units of the hull (grown by r): less
 * than 1 is inside. The cross-section is an ellipse centred between the
 * front and back reach.
 */
function hullDistance(p, r) {
  const [x, zf, zb] = hullAt(p.y)
  const zc = (zf + zb) / 2
  const zr = (zf - zb) / 2 + r
  return Math.hypot(p.x / (x + r), (p.z - zc) / zr)
}

/** How deep a sphere of radius r at p sits inside the armour; 0 when clear. */
function penetration(p, r) {
  return Math.max(0, 1 - hullDistance(p, r))
}

/** The distance from p to the segment ab. */
const segP = new THREE.Vector3()
const segAB = new THREE.Vector3()
export function segmentDistance(p, a, b) {
  segAB.subVectors(b, a)
  const t = clamp(segP.subVectors(p, a).dot(segAB) / Math.max(1e-9, segAB.lengthSq()), 0, 1)
  return segP.copy(a).addScaledVector(segAB, t).distanceTo(p)
}

// The maedate: two gilt blades rising from the brow, in body space.
const CREST = [
  [new THREE.Vector3(0, 1.48, 0.52), new THREE.Vector3(0.8, 2.36, 0.62)],
  [new THREE.Vector3(0, 1.48, 0.52), new THREE.Vector3(-0.8, 2.36, 0.62)],
]
// The head turns on the neck: points up there are tested in the head's own
// frame, where the hull was measured.
const HEAD_PIVOT = new THREE.Vector3(0, 1.07, 0)
const headInv = new THREE.Quaternion()
const inHead = new THREE.Vector3()
/** The head's turn relative to the body this frame (call before inArmour). */
export function setHeadPose(q) {
  headInv.copy(q).invert()
}
// Extra obstacles for this frame: capsules [a, b, radius] in body space —
// for the blade, and the ones the arms keep out of as well.
const extra = []
const armExtra = []
/** Sets this frame's extra obstacles: the blade's, and the arms'. */
export function setObstacles(list, forArms = []) {
  extra.length = 0
  for (const c of list) extra.push(c)
  for (const c of forArms) extra.push(c)
  armExtra.length = 0
  for (const c of forArms) armExtra.push(c)
}

/**
 * True if a sphere of radius r at p (body space) is inside the armour, the
 * helmet or its crest, or this frame's extra obstacles — what the blade must
 * never pass through.
 */
export function inArmour(p, r) {
  let q = p
  if (p.y > 0.72) q = inHead.subVectors(p, HEAD_PIVOT).applyQuaternion(headInv).add(HEAD_PIVOT)
  if (q.y > HULL_Y0 && q.y < HULL_Y0 + HULL_STEP * (HULL.length - 1) && hullDistance(q, r) < 1) return true
  for (const [a, b] of CREST) if (segmentDistance(q, a, b) < 0.07 + r) return true
  for (const [a, b, radius] of extra) if (segmentDistance(p, a, b) < radius + r) return true
  return false
}

/** Moves a point straight out to the armour's surface if it is inside. */
export function keepOutOfBody(p, r) {
  const q = hullDistance(p, r)
  if (q >= 1) return p
  const zc = (hullAt(p.y)[1] + hullAt(p.y)[2]) / 2
  if (q < 1e-4) p.z = zc + hullAt(p.y)[1] + r
  else {
    p.x /= q
    p.z = zc + (p.z - zc) / q
  }
  return p
}

// The scabbards on his left hip, angled back and down: a capsule the free
// hand keeps out of.
const SAYA_A = new THREE.Vector3(-0.42, 0.16, 0.2)
const SAYA_B = new THREE.Vector3(-0.68, -0.34, -0.84)
const SAYA_R = 0.045
const sayaAB = new THREE.Vector3().subVectors(SAYA_B, SAYA_A)
const sayaLen2 = sayaAB.lengthSq()
const sayaP = new THREE.Vector3()
function sayaPenetration(p, r) {
  const t = clamp(sayaP.subVectors(p, SAYA_A).dot(sayaAB) / sayaLen2, 0, 1)
  const d = sayaP.copy(SAYA_A).addScaledVector(sayaAB, t).distanceTo(p)
  return Math.max(0, 1 - d / (SAYA_R + r))
}

/* ================================================================
   Arms
   ================================================================ */
// Where each elbow points by default: down, out and back, as a relaxed arm's
// does. [the free arm, the katana arm]
const ARM_POLES = [-1, 1].map((side) => new THREE.Vector3(side * 0.5, -0.5, -0.7).normalize())
// Swivel angles to try around the reach, nearest the default first — out to
// an elbow carried well forward, as a two-handed grip carries it.
const SWIVELS = [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05, 1.31, -1.31, 1.57, -1.57, 1.83, -1.83, 2.09, -2.09, 2.36, -2.36]

const ik_ = {
  S: new THREE.Vector3(),
  T: new THREE.Vector3(),
  E: new THREE.Vector3(),
  u: new THREE.Vector3(),
  v: new THREE.Vector3(),
  w: new THREE.Vector3(),
  p: new THREE.Vector3(),
  q: new THREE.Vector3(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  m: new THREE.Matrix4(),
}

/** The elbow for a swivel of the default pole about the reach. */
function elbowAt(swivel, cosA, sinA) {
  const { S, E, u, v, w, p } = ik_
  p.copy(v).multiplyScalar(Math.cos(swivel)).addScaledVector(w, Math.sin(swivel))
  return E.copy(S).addScaledVector(u, UPPER_ARM * cosA).addScaledVector(p, UPPER_ARM * sinA)
}

/** How much of an arm (elbow half of the upper arm, and the forearm) is in the armour. */
function armPenetration(swivel, cosA, sinA, side) {
  const { S, T, q } = ik_
  const E = elbowAt(swivel, cosA, sinA)
  let pen = 0
  for (const t of [0.55, 0.8, 1]) pen += penetration(q.lerpVectors(S, E, t), 0.1)
  for (const t of [0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
    q.lerpVectors(E, T, t)
    pen += penetration(q, 0.095)
    if (side < 0) pen += sayaPenetration(q, 0.095)
    for (const [a, b, radius] of armExtra) pen += Math.max(0, 1 - segmentDistance(q, a, b) / (radius + 0.095))
  }
  return pen
}

/**
 * Two-bone IK with a pole. The elbow sits in the plane of the reach and the
 * pole, so it points down and out instead of wherever a fixed swivel would
 * put it; of the swivels that keep the arm out of the armour, the one
 * closest to that default wins, eased over a few frames so it never pops.
 * Writes the shoulder's orientation (in body space: the upper arm runs down
 * its local -Y and bends toward its local +Z) and the elbow's bend.
 */
export function solveArm(target, side, state, dt, out) {
  const { S, T, E, u, v, w, x, y, z, m } = ik_
  S.set(side * SHOULDER_X, SHOULDER_Y, 0)
  u.subVectors(target, S)
  const len = u.length() || 1e-6
  const d = clamp(len, UPPER_ARM - FOREARM + 0.02, (UPPER_ARM + FOREARM) * 0.999)
  u.divideScalar(len)
  T.copy(S).addScaledVector(u, d)
  const cosA = clamp((UPPER_ARM ** 2 + d * d - FOREARM ** 2) / (2 * UPPER_ARM * d), -1, 1)
  const sinA = Math.sqrt(1 - cosA * cosA)

  v.copy(ARM_POLES[side > 0 ? 1 : 0])
  v.addScaledVector(u, -v.dot(u))
  if (v.lengthSq() < 1e-6) v.set(side, 0, 0).addScaledVector(u, -u.x * side)
  v.normalize()
  w.crossVectors(u, v)

  let best = 0
  let bestScore = Infinity
  for (const sw of SWIVELS) {
    // An elbow raised above a hand that is below the shoulder is a wing: the
    // search prefers to go round the body low.
    const wing = Math.max(0, elbowAt(sw, cosA, sinA).y - Math.max(T.y, SHOULDER_Y))
    const score = armPenetration(sw, cosA, sinA, side) + Math.abs(sw) * 0.015 + wing * 0.5
    if (score < bestScore) {
      bestScore = score
      best = sw
    }
  }
  // The elbow swings to its new swivel on a spring: it never starts or
  // stops with a jolt, however suddenly the best swivel changes.
  if (dt > 0) {
    const r = spring(state.swivel, state.swivelV || 0, best, 11, dt)
    state.swivel = r.x
    state.swivelV = r.v
  } else state.swivel = best

  elbowAt(state.swivel, cosA, sinA)
  y.subVectors(E, S).normalize() // upper arm direction
  z.subVectors(T, E).normalize() // forearm direction
  out.bend = Math.acos(clamp(y.dot(z), -1, 1))
  z.addScaledVector(y, -z.dot(y))
  // A straight arm has no bend to face: keep the inside of the elbow forward.
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(y, -y.z)
  z.normalize()
  y.negate()
  x.crossVectors(y, z)
  out.q.setFromRotationMatrix(m.makeBasis(x, y, z))
  return out
}

/* ================================================================
   Legs
   ================================================================ */
/**
 * Two-bone IK for a leg, in the figure's frame: from the hip joint H to the
 * ankle A, the knee bending toward `pole` (the way the foot points). Writes
 * the hip's orientation (the thigh runs down its local -Y; the shin folds
 * back about its local X), the knee's bend (0 = straight) and the knee's
 * position.
 */
export function solveLeg(H, A, pole, out) {
  const { u, v, x, y, z, m } = ik_
  u.subVectors(A, H)
  const len = u.length() || 1e-6
  const d = clamp(len, 0.08, (THIGH + SHIN) * 0.9995)
  u.divideScalar(len)
  const cosK = clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1)
  out.bend = Math.PI - Math.acos(cosK)
  const cosH = clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1)
  const sinH = Math.sqrt(1 - cosH * cosH)
  v.copy(pole).addScaledVector(u, -pole.dot(u))
  if (v.lengthSq() < 1e-6) v.set(0, 0, 1).addScaledVector(u, -u.z)
  v.normalize()
  // thigh = u cosH + v sinH; the kneecap faces v turned by the same angle
  y.copy(u).multiplyScalar(cosH).addScaledVector(v, sinH)
  out.knee.copy(H).addScaledVector(y, THIGH)
  z.copy(v).multiplyScalar(cosH).addScaledVector(u, -sinH).normalize()
  y.negate()
  x.crossVectors(y, z)
  out.q.setFromRotationMatrix(m.makeBasis(x, y, z))
  return out
}

/**
 * The ankle's height when a foot pitched by `pitch` (positive: toes down)
 * rests its lowest point on the floor.
 */
export function footFloorY(pitch) {
  const c = Math.cos(pitch)
  const s = Math.sin(pitch)
  let low = Infinity
  for (const y of [BOOT.min[1], BOOT.max[1]]) for (const z of [BOOT.min[2], BOOT.max[2]]) low = Math.min(low, y * c - z * s)
  return ANKLE_Y - (low - BOOT.min[1])
}

/* ================================================================
   The wrist
   ================================================================ */
const twistQ = new THREE.Quaternion()
/**
 * Splits a rotation into a twist about the local Y axis and the swing left
 * over (q = swing · twist), and reports both angles.
 */
export function swingTwist(q, out) {
  const s = Math.hypot(q.w, q.y) || 1
  out.twist.set(0, q.y / s, 0, q.w / s)
  out.twistAngle = 2 * Math.atan2(q.y, q.w)
  if (out.twistAngle > Math.PI) out.twistAngle -= 2 * Math.PI
  if (out.twistAngle < -Math.PI) out.twistAngle += 2 * Math.PI
  out.swing.copy(q).multiply(twistQ.copy(out.twist).invert())
  out.swingAngle = 2 * Math.acos(clamp(Math.abs(out.swing.w), 0, 1))
  return out
}

const axis = new THREE.Vector3()
/** Shortens a rotation to at most `maxAngle` radians about the same axis. */
export function limitRotation(q, maxAngle) {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w)
  const angle = 2 * Math.acos(clamp(q.w, -1, 1))
  if (angle <= maxAngle) return q
  const s = Math.sqrt(Math.max(1e-12, 1 - q.w * q.w))
  axis.set(q.x / s, q.y / s, q.z / s)
  return q.setFromAxisAngle(axis, maxAngle)
}

/* ================================================================
   Springs
   ================================================================ */
/** Critically damped spring, solved exactly, so it is stable at any frame rate. */
const springOut = { x: 0, v: 0 }
export function spring(x, v, target, omega, dt) {
  const y = x - target
  const e = Math.exp(-omega * dt)
  const k = (v + omega * y) * dt
  springOut.x = target + (y + k) * e
  springOut.v = (v - omega * k) * e
  return springOut
}

/** Springs each component of a vector toward `goal`, updating `velocity` in place. */
export function springVec(v, velocity, goal, omega, dt) {
  for (const axis of ['x', 'y', 'z']) {
    const r = spring(v[axis], velocity[axis], goal[axis], omega, dt)
    v[axis] = r.x
    velocity[axis] = r.v
  }
}

/** A damped value that lags behind its goal: `s` is { x, v }. */
export function lag(s, goal, omega, dt) {
  const r = spring(s.x, s.v, goal, omega, dt)
  s.x = r.x
  s.v = r.v
  return s.x
}
