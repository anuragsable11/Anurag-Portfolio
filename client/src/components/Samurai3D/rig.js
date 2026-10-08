import * as THREE from 'three'

/**
 * The samurai rig contract: what a model must contain to be driven.
 *
 * Two kinds of model are understood (see SamuraiLoader.js):
 *
 *  1. The samurai rig (RIG_VERSION). The built-in model, and any GLB
 *     exported from it (tools/export-samurai-glb.html) or re-modelled on
 *     its skeleton. Every joint below is a node with exactly this name, in
 *     the same rest pose and axes (+Y up, the character facing +Z, the
 *     katana hand on +X) under a root mirrored in X (scale.x = -1, so the
 *     katana hand is his right), and the root node carries
 *     extras.rig = RIG_VERSION. Such a model gets the full procedural
 *     performance: moods, IK arms, secondary motion, meditation, the gaze.
 *
 *  2. Any other rigged character. It is played from its own animation
 *     clips (CLIPS, names case-insensitive) through an AnimationMixer with
 *     crossfades; the gaze is layered onto a head bone found by name, and
 *     the blade effects use the sockets if present.
 */
export const RIG_VERSION = 'samurai-rig-v1'

/**
 * Joints, by name. _R is his right (+X in the rig's own frame, the katana
 * side), _L his left, which carries the free hand. An
 * 'eyeLight' point light under 'head' is optional.
 */
export const JOINTS = [
  'samurai',
  'hip_R', 'knee_R', 'ankle_R', 'hip_L', 'knee_L', 'ankle_L',
  'body', 'torso', 'cuirass', 'skirt',
  'kusazuri_0', 'kusazuri_1', 'kusazuri_2', 'kusazuri_3', 'kusazuri_4', 'kusazuri_5',
  'saya', 'agemaki',
  'head', 'helmet', 'crest', 'eye_L', 'eye_R', 'eyeGlow_L', 'eyeGlow_R',
  'shoulder_L', 'elbow_L', 'sode_L', 'hand_L',
  'shoulder_R', 'elbow_R', 'sode_R',
  'katana',
]

/** Empty nodes on the blade: just past the guard, and the point. */
export const SOCKETS = { katanaBase: 'katana_base', katanaTip: 'katana_tip' }

/**
 * Animation clips a model of the second kind should carry. IDLE loops; the
 * rest play once. A click plays ATTENTION → DRAW_KATANA → STANCE →
 * RETURN_IDLE, crossfaded. Moves (DRAW, SPIN, LEAP, THRUST, SALUTE, BOW,
 * NOD, SLASH, HOP) are optional: a missing one is skipped.
 */
export const CLIPS = ['IDLE', 'ATTENTION', 'DRAW_KATANA', 'STANCE', 'RETURN_IDLE']

/**
 * Rebuilds the samurai rig from a loaded scene, or returns null if the
 * scene is not one (no marker, or a joint missing).
 */
export function rigFromScene(scene) {
  const root = scene.getObjectByName('samurai')
  if (!root || root.userData?.rig !== RIG_VERSION) return null
  const get = (name) => root.getObjectByName(name)
  if (JOINTS.some((name) => name !== 'samurai' && !get(name))) return null
  const side = (s) => (s === 'R' ? 1 : -1)
  const saya = get('saya')
  const arms = ['L', 'R'].map((s) => ({
    shoulder: get(`shoulder_${s}`),
    elbow: get(`elbow_${s}`),
    sode: get(`sode_${s}`),
    hand: get(`hand_${s}`) || null,
    side: side(s),
  }))
  return {
    kind: 'samurai',
    root,
    legs: ['L', 'R'].map((s) => ({
      hip: get(`hip_${s}`),
      knee: get(`knee_${s}`),
      ankle: get(`ankle_${s}`),
      side: side(s),
    })),
    arms,
    panels: Array.from({ length: 6 }, (_, i) => {
      const flap = get(`kusazuri_${i}`)
      return { flap, facing: flap.userData.facing ?? 0, spread: flap.userData.spread ?? 0.5 }
    }),
    eyes: [get('eye_L'), get('eye_R')],
    glows: [get('eyeGlow_L'), get('eyeGlow_R')],
    tails: [],
    body: get('body'),
    torso: get('torso'),
    cuirass: get('cuirass'),
    skirt: get('skirt'),
    headRig: get('head'),
    helmet: get('helmet'),
    katana: get('katana'),
    saya,
    sayaStand: new THREE.Quaternion().fromArray(saya.userData.stand || saya.quaternion.toArray()),
    sayaSeated: new THREE.Quaternion().fromArray(saya.userData.seated || saya.quaternion.toArray()),
    crest: get('crest'),
    agemaki: get('agemaki'),
    eyeLight: findLight(get('eyeLight')),
    sodeBaseQ: arms.map(({ sode }) => sode.quaternion.clone()),
    sockets: findSockets(root),
  }
}

/** The light at (or just under) a node — glTF can wrap a light in a node. */
function findLight(node) {
  const light = node?.isLight ? node : node?.children.find((c) => c.isLight)
  // Without one, a light that is never added to the scene keeps the code simple.
  return light || new THREE.PointLight(0xffb347, 0, 1.3, 2)
}

/** The blade sockets, or null when the model has none. */
export function findSockets(scene) {
  const katanaBase = scene.getObjectByName(SOCKETS.katanaBase)
  const katanaTip = scene.getObjectByName(SOCKETS.katanaTip)
  return katanaBase && katanaTip ? { katanaBase, katanaTip } : null
}

/** A head bone in common naming schemes (Mixamo, Blender, VRM, ours). */
export function findHead(scene) {
  let head = null
  scene.traverse((o) => {
    if (head) return
    const name = o.name.toLowerCase()
    if (name === 'head' || name.endsWith(':head') || name.endsWith('_head') || name === 'j_bip_c_head') head = o
  })
  return head
}

/**
 * The minimal rig of a model of the second kind: its root, a head for the
 * gaze, and the blade sockets (with the blade itself, for the glint) when
 * it has them.
 */
export function genericRig(scene) {
  const sockets = findSockets(scene)
  return {
    kind: 'generic',
    root: scene,
    head: findHead(scene),
    sockets,
    katana: sockets ? sockets.katanaTip.parent : null,
    glows: [],
  }
}
