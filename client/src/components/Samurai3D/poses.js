import * as THREE from 'three'
import { FOREARM, KATANA_SWEEP, KATANA_TILT, SHOULDER_X, SHOULDER_Y, UPPER_ARM } from './constants.js'

/**
 * Moods and actions: the poses the samurai eases between, and the keyframed
 * one-shot performances layered on top of them.
 *
 * Poses are authored in body space: origin at the hips, +Y up, +Z forward,
 * +X toward the katana hand. Hands are IK targets for the centre of the fist;
 * the blade is a direction plus the way its edge faces. Every hand sits
 * outside the armour (see ik.js's hull: the dō reaches 0.35 forward and
 * 0.45 to each side, the helmet 0.93 to each side) and every blade keeps
 * its point off the floor and out of the helmet and crest.
 */

/** Every scalar a pose can set. */
export const SCALARS = [
  'lean', // forward bend at the hips
  'twist', // body turn
  'tilt', // body roll
  'crouch', // knee bend
  'splay', // stance width: how far out each foot stands
  'stride', // stance length: the katana-side foot this far forward, the other back
  'heels', // 1 = up on the balls of the feet
  'lift', // hop height
  'headPitch',
  'headYaw',
  'headTilt',
  'wander', // slow, absent-minded gaze drift
  'eyeOpen',
  'eyeGlow',
  'eyeTilt', // + inner corners down (intent), − outer corners down (warmth)
  'heat', // + eye colour toward red, − toward warm white
  'glint', // extra reflection on the blade
  'sway', // idle motion amount
  'breathRate',
  'breathDepth',
  'lookGain', // how much he follows the cursor
  'twoHand', // 1 = the free hand joins the grip
]

/** Blade orientation from where it points and which way its edge faces. */
export function bladeQuat(dir, edge = [0, 0, 1]) {
  return bladeQuatInto(new THREE.Vector3(...dir), new THREE.Vector3(...edge), new THREE.Quaternion())
}

const bq = { y: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4() }
/** The same, allocation-free: `dir` and `edge` are vectors, the result goes into `q`. */
export function bladeQuatInto(dir, edge, q) {
  const { x, y, z, m } = bq
  y.copy(dir).normalize()
  x.copy(edge)
  for (const fallback of [null, [0, -1, 0], [1, 0, 0]]) {
    if (fallback) x.set(...fallback)
    x.addScaledVector(y, -x.dot(y))
    if (x.lengthSq() > 1e-4) break
  }
  x.normalize()
  z.crossVectors(x, y)
  return q.setFromRotationMatrix(m.makeBasis(x, y, z))
}

// The relaxed pose: the arm hanging with the elbow a little bent, the katana
// carried low out to his side, its point forward of him and well off the
// floor (it is a long blade for a short arm).
export const REST = (() => {
  const qS = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.16))
  const qE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0))
  const qK = new THREE.Quaternion().setFromEuler(new THREE.Euler(KATANA_TILT, 0, Math.PI + KATANA_SWEEP))
  const hand = new THREE.Vector3(0, -FOREARM, 0)
    .applyQuaternion(qE)
    .add(new THREE.Vector3(0, -UPPER_ARM, 0))
    .applyQuaternion(qS)
    .add(new THREE.Vector3(SHOULDER_X, SHOULDER_Y, 0))
  const blade = qS.clone().multiply(qE).multiply(qK)
  return {
    hand,
    blade,
    /** The blade's rest in the forearm's frame: the wrist at ease. */
    grip: qK,
    dir: new THREE.Vector3(0, 1, 0).applyQuaternion(blade),
    edge: new THREE.Vector3(1, 0, 0).applyQuaternion(blade),
  }
})()

/** Where a hanging hand ends up, in body space, when the body leans forward. */
export const hangingHand = (side, lean) => {
  const rel = new THREE.Vector3(REST.hand.x - SHOULDER_X, REST.hand.y - SHOULDER_Y, REST.hand.z)
  rel.applyAxisAngle(new THREE.Vector3(1, 0, 0), -lean)
  return [side * (SHOULDER_X + rel.x), SHOULDER_Y + rel.y, rel.z]
}

export const CALM = {
  lean: 0,
  twist: 0,
  tilt: 0,
  crouch: 0.08,
  splay: 0.05,
  stride: 0,
  heels: 0,
  lift: 0,
  headPitch: 0,
  headYaw: 0,
  headTilt: 0,
  wander: 0,
  eyeOpen: 1,
  eyeGlow: 0.8,
  eyeTilt: 0.06,
  heat: 0,
  glint: 0,
  sway: 1,
  breathRate: 1.45,
  breathDepth: 0.012,
  lookGain: 1,
  twoHand: 0,
}

export const MOOD_POSES = {
  // The relaxed idle he has always had.
  calm: {},
  // Paying attention, no more: weight forward a touch, head inclined
  // toward the page, eyes a little brighter, the free hand drawn in.
  attentive: {
    L: [-0.56, -0.12, 0.22],
    lean: 0.04,
    crouch: 0.04,
    splay: 0.07,
    headPitch: 0.05,
    headTilt: -0.03,
    eyeOpen: 0.9,
    eyeGlow: 0.95,
    eyeTilt: 0.1,
    sway: 0.8,
    breathRate: 1.35,
    lookGain: 1.1,
  },
  // Free hand to the chin, head cocked, gaze drifting.
  thinking: {
    L: [-0.13, 0.58, 0.56],
    blade: [[0.55, -0.5, 0.67]],
    headTilt: 0.1,
    headPitch: -0.05,
    headYaw: 0.1,
    wander: 1,
    eyeOpen: 0.78,
    eyeGlow: 0.66,
    eyeTilt: -0.03,
    sway: 0.7,
    breathRate: 1.2,
    lookGain: 0.45,
  },
  // Chudan: both hands on the grip a forearm's length before him, the point
  // level with his chin and aimed ahead, so the blade never covers his eyes.
  focused: {
    R: [0, 0.3, 0.8],
    blade: [
      [0.25, 0.3, 0.92],
      [0, -0.95, 0.31],
    ],
    twoHand: 1,
    lean: 0.06,
    crouch: 0.14,
    splay: 0.1,
    stride: 0.12,
    eyeOpen: 0.62,
    eyeGlow: 1,
    eyeTilt: 0.13,
    heat: 0.12,
    sway: 0.35,
    breathRate: 1.1,
    breathDepth: 0.01,
    lookGain: 1.15,
  },
  // A rising diagonal guard out past his katana side, low stance, eyes running hot.
  battle: {
    R: [0.14, 0.36, 0.7],
    blade: [[0.72, 0.56, 0.42]],
    twoHand: 1,
    lean: 0.1,
    crouch: 0.24,
    splay: 0.16,
    stride: 0.18,
    eyeOpen: 0.55,
    eyeGlow: 1.35,
    eyeTilt: 0.2,
    heat: 0.45,
    sway: 0.5,
    breathRate: 1.9,
    breathDepth: 0.018,
    lookGain: 0.85,
  },
  // Blade raised high beside the helmet, free fist on the hip, chin up.
  victory: {
    R: [1, 1.05, 0.2],
    blade: [[0.35, 0.92, 0.17]],
    L: [-0.56, 0.06, 0.2],
    lean: -0.06,
    headPitch: -0.14,
    eyeOpen: 0.7,
    eyeGlow: 1.3,
    eyeTilt: -0.08,
    heat: -0.5,
    glint: 0.6,
    sway: 0.8,
    breathRate: 1.6,
    lookGain: 0.6,
  },
}

// One-shot performances: keyframes between the pose he was in and the pose
// his mood calls for. A key sets only what it names; the rest follows the
// mood. Keys are joined by a monotone spline, so a move flows through its
// middle keys without stopping, and holds where two keys agree.
export const ACTION_DEFS = {
  // Kesa-giri: the blade comes up beside the helmet, over, and down across
  // the body in one arc, the front foot stepping into the cut.
  slash: {
    duration: 0.95,
    keys: [
      {
        t: 0.22,
        R: [0.95, 0.78, 0.15],
        blade: [[0.4, 0.65, -0.65]],
        L: [-0.42, 0.22, 0.45],
        twoHand: 0,
        twist: 0.25,
        lean: -0.04,
        crouch: 0.12,
        eyeGlow: 1.25,
      },
      {
        t: 0.34,
        R: [0.98, 0.95, 0.45],
        blade: [[0.2, 0.9, 0.4]],
        L: [-0.44, 0.15, 0.42],
        twoHand: 0,
        twist: 0.1,
        lean: 0,
        crouch: 0.1,
        glint: 0.6,
        eyeGlow: 1.4,
      },
      {
        t: 0.5,
        R: [-0.05, 0.1, 0.66],
        blade: [[-0.5, -0.5, 0.71]],
        L: [-0.5, -0.02, 0.32],
        twoHand: 0,
        twist: -0.28,
        lean: 0.16,
        crouch: 0.22,
        stride: 0.2,
        glint: 1,
        eyeGlow: 1.6,
        eyeOpen: 0.5,
        eyeTilt: 0.2,
      },
      {
        t: 0.72,
        R: [-0.05, 0.1, 0.66],
        blade: [[-0.5, -0.5, 0.71]],
        L: [-0.5, -0.02, 0.32],
        twoHand: 0,
        twist: -0.24,
        lean: 0.14,
        crouch: 0.2,
        stride: 0.2,
        glint: 0.3,
        eyeGlow: 1.3,
      },
    ],
  },
  // The hidden one: the blade swings out and back behind his hip, then a
  // draw-cut across the front, held, and the flick to clear the blade.
  draw: {
    duration: 1.6,
    keys: [
      {
        t: 0.08,
        R: [0.74, 0.02, 0.22],
        blade: [[0.72, -0.45, 0.53]],
        L: [-0.42, 0.25, 0.46],
        twoHand: 0,
        crouch: 0.2,
        twist: 0.12,
        lean: 0.06,
        eyeOpen: 0.6,
        eyeGlow: 1,
      },
      {
        t: 0.2,
        R: [0.62, 0.08, -0.2],
        blade: [[0.3, -0.35, -0.89]],
        L: [-0.4, 0.28, 0.48],
        twoHand: 0,
        crouch: 0.26,
        twist: 0.2,
        lean: 0.1,
        eyeOpen: 0.5,
        eyeGlow: 1.1,
      },
      {
        t: 0.29,
        R: [0.64, 0.14, 0.3],
        blade: [[0.85, -0.3, 0.44]],
        L: [-0.48, 0.22, 0.38],
        twoHand: 0,
        crouch: 0.24,
        twist: -0.05,
        lean: 0.11,
        glint: 0.6,
        eyeGlow: 1.4,
      },
      {
        t: 0.38,
        R: [0.1, 0.36, 0.72],
        blade: [[-0.72, 0.08, 0.69]],
        L: [-0.55, 0.15, 0.25],
        twoHand: 0,
        twist: -0.3,
        lean: 0.12,
        crouch: 0.2,
        stride: 0.22,
        glint: 1,
        eyeGlow: 1.7,
        eyeOpen: 0.45,
        eyeTilt: 0.22,
        heat: 0.5,
      },
      {
        t: 0.54,
        R: [0.1, 0.36, 0.72],
        blade: [[-0.72, 0.08, 0.69]],
        L: [-0.55, 0.15, 0.25],
        twoHand: 0,
        twist: -0.28,
        lean: 0.1,
        crouch: 0.18,
        stride: 0.22,
        glint: 0.6,
        eyeGlow: 1.5,
        eyeOpen: 0.5,
        heat: 0.4,
      },
      {
        t: 0.74,
        R: [0.68, 0.05, 0.42],
        blade: [[0.45, -0.55, 0.7]],
        twoHand: 0,
        twist: 0.05,
        crouch: 0.14,
        glint: 0.2,
        eyeGlow: 1.2,
      },
    ],
  },
  // A respectful bow: arms hang, blade low, eyes lowered.
  bow: {
    duration: 1.9,
    keys: [0.32, 0.66].map((t) => ({
      t,
      lean: 0.4,
      headPitch: 0.12,
      R: hangingHand(1, 0.4),
      L: hangingHand(-1, 0.4),
      bladeLean: 0.4,
      twoHand: 0,
      crouch: 0,
      eyeOpen: 0.55,
      eyeGlow: 0.6,
      sway: 0.3,
      lookGain: 0,
    })),
  },
  // A small acknowledgement.
  nod: {
    duration: 0.7,
    keys: [{ t: 0.4, headPitch: 0.17, lookGain: 0.3 }],
  },
  // S — whirlwind: wind up, rise onto the balls of the feet, then a full
  // turn with the blade held out flat, finishing in a low guard.
  spin: {
    duration: 1.6,
    spin: [0.24, 0.72, -Math.PI * 2],
    keys: [
      {
        t: 0.18,
        R: [0.72, 0.42, 0.3],
        blade: [[0.6, 0.1, -0.79]],
        L: [-0.5, 0.3, 0.42],
        twoHand: 0,
        crouch: 0.22,
        twist: 0.4,
        lean: 0.06,
        eyeGlow: 1.3,
        lookGain: 0,
      },
      {
        t: 0.3,
        R: [0.92, 0.5, 0.28],
        blade: [[0.98, 0.05, 0.2]],
        L: [-0.6, 0.3, 0.14],
        twoHand: 0,
        crouch: 0.16,
        twist: 0,
        lean: 0,
        heels: 1,
        glint: 1,
        eyeGlow: 1.6,
        eyeOpen: 0.5,
        eyeTilt: 0.18,
        lookGain: 0,
      },
      {
        t: 0.68,
        R: [0.92, 0.5, 0.28],
        blade: [[0.98, 0.05, 0.2]],
        L: [-0.6, 0.3, 0.14],
        twoHand: 0,
        crouch: 0.16,
        heels: 1,
        glint: 1,
        eyeGlow: 1.6,
        eyeOpen: 0.5,
        lookGain: 0,
      },
      {
        t: 0.84,
        R: [0.45, 0.2, 0.6],
        blade: [[0.4, -0.5, 0.77]],
        L: [-0.46, 0.2, 0.36],
        twoHand: 0,
        crouch: 0.24,
        lean: 0.1,
        heels: 0,
        glint: 0.3,
        eyeGlow: 1.2,
      },
    ],
  },
  // J — leap: crouch, spring up with the blade raised high, land low.
  leap: {
    duration: 1.4,
    keys: [
      {
        t: 0.2,
        R: [0.56, 0.22, 0.4],
        blade: [[0.4, -0.6, 0.69]],
        L: [-0.52, 0.24, 0.3],
        twoHand: 0,
        crouch: 0.34,
        lean: 0.16,
        lift: 0,
        eyeGlow: 1.1,
      },
      {
        t: 0.42,
        R: [0.95, 1.05, 0.2],
        blade: [[0.25, 0.95, 0.17]],
        L: [-0.7, 0.75, 0.2],
        twoHand: 0,
        crouch: 0,
        lean: -0.08,
        lift: 0.55,
        headPitch: -0.14,
        glint: 1,
        eyeGlow: 1.6,
        eyeTilt: -0.08,
        heat: -0.4,
      },
      {
        t: 0.56,
        R: [0.95, 1.05, 0.2],
        blade: [[0.25, 0.95, 0.17]],
        L: [-0.7, 0.75, 0.2],
        twoHand: 0,
        crouch: 0,
        lean: -0.06,
        lift: 0.5,
        headPitch: -0.12,
        glint: 0.8,
        eyeGlow: 1.5,
        heat: -0.4,
      },
      {
        t: 0.76,
        R: [0.58, 0.28, 0.5],
        blade: [[0.5, -0.3, 0.81]],
        L: [-0.48, 0.22, 0.4],
        twoHand: 0,
        crouch: 0.3,
        lean: 0.14,
        lift: 0,
        eyeGlow: 1.2,
      },
    ],
  },
  // T — thrust: both hands to the grip, then a lunge, the front foot
  // stepping out, driving the point straight at the viewer.
  thrust: {
    duration: 1.3,
    keys: [
      {
        t: 0.22,
        R: [0, 0.38, 0.76],
        blade: [
          [0, 0.12, 1],
          [0, -1, 0],
        ],
        twoHand: 1,
        crouch: 0.18,
        twist: 0.18,
        lean: 0.02,
        eyeOpen: 0.55,
        eyeGlow: 1.2,
        eyeTilt: 0.16,
      },
      {
        t: 0.42,
        R: [-0.02, 0.44, 0.78],
        blade: [
          [0, 0.05, 1],
          [0, -1, 0],
        ],
        twoHand: 1,
        crouch: 0.3,
        splay: 0.12,
        stride: 0.3,
        twist: -0.05,
        lean: 0.22,
        glint: 1,
        eyeOpen: 0.45,
        eyeGlow: 1.7,
        eyeTilt: 0.22,
        heat: 0.5,
        lookGain: 0,
      },
      {
        t: 0.64,
        R: [-0.02, 0.44, 0.78],
        blade: [
          [0, 0.05, 1],
          [0, -1, 0],
        ],
        twoHand: 1,
        crouch: 0.28,
        splay: 0.12,
        stride: 0.3,
        lean: 0.2,
        glint: 0.5,
        eyeGlow: 1.5,
        heat: 0.4,
        lookGain: 0,
      },
    ],
  },
  // B — salute: the blade raised upright before the face in both hands,
  // then lowered for a deep bow.
  salute: {
    duration: 2.6,
    keys: [
      {
        t: 0.18,
        R: [-0.02, 0.5, 0.68],
        blade: [[0, 0.93, 0.37]],
        twoHand: 1,
        headPitch: 0.04,
        eyeOpen: 0.7,
        eyeGlow: 1.1,
        glint: 0.6,
        lookGain: 0,
      },
      {
        t: 0.42,
        R: [-0.02, 0.5, 0.68],
        blade: [[0, 0.93, 0.37]],
        twoHand: 1,
        headPitch: 0.04,
        eyeOpen: 0.7,
        eyeGlow: 1.1,
        glint: 0.6,
        lookGain: 0,
      },
      ...[0.62, 0.84].map((t) => ({
        t,
        lean: 0.4,
        headPitch: 0.12,
        R: hangingHand(1, 0.4),
        L: hangingHand(-1, 0.4),
        bladeLean: 0.4,
        twoHand: 0,
        crouch: 0,
        eyeOpen: 0.55,
        eyeGlow: 0.6,
        sway: 0.3,
        lookGain: 0,
      })),
    ],
  },
  // A small spring off the heels.
  hop: {
    duration: 0.6,
    keys: [
      { t: 0.28, crouch: 0.2, lift: 0 },
      { t: 0.58, crouch: 0, lift: 0.08 },
    ],
  },
  // The answer to a click. ATTENTION: he straightens onto the balls of his
  // feet and his eyes catch light. DRAW_KATANA: the free hand comes to the
  // grip and the blade rises upright before his face, its flat turned to
  // the viewer. STANCE: one quick, decisive drop into a low guard, the front
  // foot stepping out, the point toward the viewer — the blade sparks and a
  // ring of energy leaves his feet — held a moment. RETURN_IDLE: he eases
  // back into whatever his mood is.
  cinematic: {
    duration: 2.5,
    states: [
      ['ATTENTION', 0],
      ['DRAW_KATANA', 0.12],
      ['STANCE', 0.42],
      ['RETURN_IDLE', 0.74],
    ],
    keys: [
      {
        t: 0.12,
        lean: -0.03,
        headPitch: -0.04,
        heels: 0.3,
        splay: 0.08,
        eyeGlow: 1.25,
        eyeOpen: 0.85,
        eyeTilt: 0.12,
        lookGain: 1.3,
        sway: 0.3,
      },
      {
        t: 0.24,
        R: [0.3, 0.06, 0.66],
        blade: [[0.45, -0.35, 0.82]],
        twoHand: 1,
        lean: 0.02,
        heels: 0,
        splay: 0.08,
        eyeGlow: 1.3,
        eyeOpen: 0.8,
        eyeTilt: 0.14,
        lookGain: 1,
        sway: 0.3,
      },
      {
        t: 0.42,
        R: [-0.02, 0.5, 0.66],
        blade: [
          [0.04, 0.95, 0.31],
          [1, 0, 0],
        ],
        twoHand: 1,
        lean: -0.02,
        splay: 0.09,
        headPitch: 0.02,
        glint: 0.8,
        eyeGlow: 1.4,
        eyeOpen: 0.7,
        eyeTilt: 0.16,
        lookGain: 0.2,
        sway: 0.2,
        cue: 'glint',
      },
      {
        t: 0.52,
        R: [0.02, 0.32, 0.78],
        blade: [
          [0.3, 0.3, 0.9],
          [0, -0.95, 0.32],
        ],
        twoHand: 1,
        crouch: 0.28,
        splay: 0.14,
        stride: 0.22,
        lean: 0.12,
        twist: -0.12,
        glint: 1,
        eyeGlow: 1.7,
        eyeOpen: 0.5,
        eyeTilt: 0.22,
        heat: 0.4,
        lookGain: 0.6,
        sway: 0.2,
        cue: 'impact',
      },
      {
        t: 0.74,
        R: [0.02, 0.32, 0.78],
        blade: [
          [0.3, 0.3, 0.9],
          [0, -0.95, 0.32],
        ],
        twoHand: 1,
        crouch: 0.25,
        splay: 0.14,
        stride: 0.22,
        lean: 0.1,
        twist: -0.1,
        glint: 0.4,
        eyeGlow: 1.4,
        eyeOpen: 0.55,
        eyeTilt: 0.2,
        heat: 0.3,
        lookGain: 0.6,
        sway: 0.4,
      },
    ],
  },
}

/**
 * Reduced motion: the same answer to a click, without the quick moves —
 * he raises the blade before his face and settles into a shallow guard,
 * slowly, with no sparks or trail, then eases back.
 */
ACTION_DEFS.cinematicGentle = {
  duration: 3.4,
  states: [
    ['ATTENTION', 0],
    ['DRAW_KATANA', 0.1],
    ['STANCE', 0.38],
    ['RETURN_IDLE', 0.72],
  ],
  keys: [
    { t: 0.1, eyeGlow: 1.15, eyeOpen: 0.85, lookGain: 0.5 },
    {
      t: 0.38,
      R: [-0.02, 0.5, 0.66],
      blade: [
        [0.04, 0.95, 0.31],
        [1, 0, 0],
      ],
      twoHand: 1,
      glint: 0.6,
      eyeGlow: 1.3,
      eyeOpen: 0.75,
      lookGain: 0.2,
    },
    {
      t: 0.72,
      R: [0, 0.3, 0.8],
      blade: [
        [0.25, 0.3, 0.92],
        [0, -0.95, 0.31],
      ],
      twoHand: 1,
      crouch: 0.1,
      splay: 0.1,
      lean: 0.05,
      glint: 0.5,
      eyeGlow: 1.35,
      eyeOpen: 0.62,
      eyeTilt: 0.13,
      lookGain: 0.4,
    },
  ],
}

/**
 * The named animation states and the pose each holds when transitioned to
 * on its own (see the controller's transitionAnimation). IDLE is whatever
 * the current mood is; RETURN_IDLE is the ease back into it.
 */
export const STATES = ['IDLE', 'ATTENTION', 'DRAW_KATANA', 'STANCE', 'RETURN_IDLE']
export const STATE_POSES = {
  ATTENTION: ACTION_DEFS.cinematic.keys[0],
  DRAW_KATANA: ACTION_DEFS.cinematic.keys[2],
  STANCE: ACTION_DEFS.cinematic.keys[4],
}

/**
 * Any action, made gentle for reduced motion: no turn, no leaving the
 * ground and no quick swings — its most telling key, reached slowly, held,
 * and let go. Effects cues are dropped with the speed.
 */
function gentleDef(name) {
  if (name === 'cinematic') return ACTION_DEFS.cinematicGentle
  const def = ACTION_DEFS[name]
  const { cue, ...peak } = def.keys[Math.min(def.keys.length - 1, Math.floor(def.keys.length / 2))]
  return {
    duration: Math.max(2.4, def.duration * 1.6),
    states: def.states,
    keys: [
      { ...peak, lift: 0, heels: 0, t: 0.35 },
      { ...peak, lift: 0, heels: 0, t: 0.65 },
    ],
  }
}

/** A pose: scalars, both hands, and the blade's direction and edge. */
export function makePose() {
  return {
    s: { ...CALM },
    R: REST.hand.clone(),
    L: REST.hand.clone().setX(-REST.hand.x),
    dir: REST.dir.clone(),
    edge: REST.edge.clone(),
  }
}

export function copyPose(dst, src) {
  for (const k of SCALARS) dst.s[k] = src.s[k]
  dst.R.copy(src.R)
  dst.L.copy(src.L)
  dst.dir.copy(src.dir)
  dst.edge.copy(src.edge)
  return dst
}

/** A full pose from a mood definition: unnamed channels take their calm values. */
export function poseFromDef(def) {
  const p = makePose()
  for (const k of SCALARS) if (k in def) p.s[k] = def[k]
  if (def.R) p.R.set(...def.R)
  if (def.L) p.L.set(...def.L)
  if (def.blade) {
    p.dir.set(...def.blade[0]).normalize()
    p.edge.set(...(def.blade[1] || [0, 0, 1]))
  }
  return p
}

export const MOOD_TARGETS = Object.fromEntries(
  Object.entries(MOOD_POSES).map(([mood, def]) => [mood, poseFromDef(def)])
)

/** Compiles an action definition: keys become partial poses. */
export function compileAction(def) {
  return {
    duration: def.duration,
    spin: def.spin || null,
    // [state name, start] pairs: which named state each stretch of the
    // timeline is (see STATES); null for plain actions.
    states: def.states || null,
    hold: !!def.hold,
    keys: def.keys.map((k) => {
      const s = {}
      for (const ch of SCALARS) if (ch in k) s[ch] = k[ch]
      let dir = null
      let edge = null
      if (k.blade) {
        dir = new THREE.Vector3(...k.blade[0]).normalize()
        edge = new THREE.Vector3(...(k.blade[1] || [0, 0, 1]))
      } else if (k.bladeLean) {
        // The resting blade, carried forward with the bow.
        const q = new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -k.bladeLean)
          .multiply(REST.blade)
        dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
        edge = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
      }
      return {
        t: k.t,
        partial: true,
        s,
        R: k.R ? new THREE.Vector3(...k.R) : null,
        L: k.L ? new THREE.Vector3(...k.L) : null,
        dir,
        edge,
        cue: k.cue || null,
      }
    }),
  }
}

export const ACTIONS = Object.fromEntries(
  Object.entries(ACTION_DEFS).map(([name, def]) => [name, compileAction(def)])
)

/** The reduced-motion form of each action (see gentleDef). */
export const GENTLE_ACTIONS = Object.fromEntries(
  Object.keys(ACTION_DEFS).map((name) => [name, compileAction(gentleDef(name))])
)

/** A held pose for each named state, compiled like an action key. */
export const STATE_KEYS = Object.fromEntries(
  Object.entries(STATE_POSES).map(([name, key]) => {
    const { cue, ...pose } = key
    return [name, compileAction({ duration: 1, keys: [{ ...pose, t: 1 }] }).keys[0]]
  })
)
