import { useEffect, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createVisibilityGate, cssColor } from '../lib/three-utils.js'
import { loadBakedEnvironment, renderStudioPMREM } from '../lib/studio-env.js'
import envUrl from '../assets/samurai-env.png'
import { MOVES, getState, subscribe } from '../lib/companion.js'

/**
 * An original stylised samurai mascot, modelled from primitives.
 *
 * The character is chibi, but the armour is built the way real armour is:
 * a dark fabric body underneath, with separate plates laced over the top and
 * visible gaps between them.
 *
 *  - Every plate is a solid, bevelled shell with real thickness, so its edges
 *    catch the light instead of reading as paper.
 *  - Sode, kusazuri, the lower dō, the shikoro, the haidate and the throat
 *    guard are lamellar: rows of lames joined by flat silk braid (sugake
 *    odoshi) that lies against the plates, finished with cross-knots
 *    (hishinui) along the bottom lame.
 *  - The kabuto and menpō are black urushi flecked with gold leaf: a smooth
 *    bowl with low seams, a rolled peak, broad turned-back wings, closely
 *    laced black lames at the neck, and a broad engraved gilt crest of two
 *    swept blades on a chrysanthemum boss. The mask has a curved brow, an
 *    eye band with lit slits, cheek plates, a tapered mouth guard with
 *    breathing slots and gold sunbursts, and a laced throat guard beneath.
 *  - Forearms and shins are chain mail (kusari) with iron splints laced over
 *    them; the feet are leather boots on straw soles.
 *  - The dō carries a decorative agemaki bow at the back, two small hanging
 *    plates at the chest, flank plates and rivets; the kabuto has riveted
 *    ridges with gold shinodare strips, a tiered tehen and a marked visor.
 *  - Materials are physical: clear-coated urushi lacquer, hammered iron,
 *    polished gold, mail, woven fabric with sheen, and a blade with a real
 *    hamon (temper line) — mirror-polished ji, cloudy matte ha.
 *  - On desktop, ambient occlusion darkens the gaps between plates, shadows
 *    are 4k and the frame is resolved with 8× MSAA.
 *
 * He idles standing, then periodically kneels into seiza to meditate — the
 * katana laid across his lap, eyes dimmed to slits that glow with each
 * breath — and later rises again. Click / tap / Enter toggles it at once.
 *
 * He is also the site's companion (see lib/companion.js). The page reports
 * which section is in view and what the visitor is doing; he answers with a
 * mood — calm, thinking, focused, battle, victory — and short one-shot
 * actions. Moods are whole-body poses (stance, arms via IK, blade, eyes)
 * that he eases between on springs; actions are keyframes layered on top.
 * Between them he breathes, blinks, glances about and shifts his weight,
 * and his head follows a mouse cursor. On wide desktop screens he leaves the
 * hero once it scrolls away and waits in the corner; reduced motion turns
 * all of this down to plain pose changes.
 *
 * Load time is dominated by GPU shader compilation, so the scene is built to
 * keep that small: the reflection map is baked offline (see studio-env.js),
 * every material shares one of four shader programs, repeated pieces are
 * merged rather than instanced, shaders compile in parallel off the main
 * thread, and the AO pass is only switched on once the character is already
 * on screen, with its shader variants compiled in the background first.
 *
 * Layout, standing, bottom to top (world units, floor at y = 0):
 *   0.04  sandals        1.15  hips / sash (HIP_Y)
 *   0.65  knees          1.87  shoulders
 *   2.32  eye line       2.95  helmet crown
 *   3.78  crest tips
 *
 * Drag to orbit a full 360°. Colours come from the --samurai-* CSS tokens.
 */

const HIP_Y = 1.15
const HEAD_Y = 2.22
const KATANA_TILT = -0.5

// Actions: seconds for a sit / stand transition, and how long each pose holds
// before the automatic cycle moves on.
const TRANSITION = 2.4
const FIRST_SIT_AT = 7
const MEDITATE_FOR = 9
const STAND_FOR = 13
// Seated, the legs attach lower on the pelvis (so the kusazuri drape over
// the thighs) and the whole figure drops to sit on its heels.
const LEG_DROP = 0.18
const SIT_DROP = 0.49

// Partial-cylinder helpers. three.js starts theta at +Z (the front) and
// sweeps toward +X, so each arc is described by the angle it centres on.
const arc = (center, sweep) => [center - sweep / 2, sweep]
const FRONT = 0
const BACK = Math.PI
const RIGHT = Math.PI / 2
const LEFT = -Math.PI / 2

// Extruded geometry gets UVs in world units; plates are a fraction of a unit,
// so this brings their texel density in line with the primitive geometries.
const UV_SCALE = 3

// Start fetching the baked reflection map as soon as this chunk loads, in
// parallel with React mounting the component.
const bakedEnv = loadBakedEnvironment(envUrl).catch(() => null)

const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp
const smootherstep = (k) => k * k * k * (k * (k * 6 - 15) + 10)

/* ================================================================
   Surface maps — generated in a worker, off the main thread
   ================================================================ */

// Phones get half-resolution maps: a quarter of the memory and the work.
const TEXTURE_QUALITY =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720)
    ? 'low'
    : 'high'

/** Asks a worker for the surface maps; falls back to generating them here. */
function requestTextures(quality) {
  const inline = () => import('../lib/samurai-textures.js').then((m) => m.generateTextures(quality))
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(new URL('../lib/samurai-textures.worker.js', import.meta.url), {
        type: 'module',
      })
    } catch {
      resolve(inline())
      return
    }
    worker.onmessage = (e) => {
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = () => {
      worker.terminate()
      resolve(inline())
    }
    worker.postMessage({ quality })
  })
}

// Start as soon as this chunk loads, alongside the environment map.
const texturesReady = requestTextures(TEXTURE_QUALITY).catch(() => null)

// Lames carry one row of kozane scales each; eight scales span this width.
const KOZANE_TILE = 0.28

/**
 * How each map is sampled. Plates carry world-scale UVs (UV_SCALE per
 * unit), lames carry one row of scales per lame, and the primitives carry
 * their own 0..1 UVs.
 */
const TEXTURE_SPEC = {
  grain: { repeat: 2 },
  mottle: { repeat: 1, srgb: true },
  lacquerN: { repeat: 1 },
  kozaneN: { repeat: 1, clampV: true },
  ironN: { repeat: 1 },
  ironR: { repeat: 1 },
  weaveN: { repeat: 9 },
  leatherN: { repeat: 3 },
  braidN: { repeat: 6 },
  chainN: { repeat: 9 },
  strawN: { repeat: 26 },
  woodN: { repeat: 1 },
  fabricTone: { repeat: 2, srgb: true },
  blade: { repeat: 1, srgb: true, clamp: true },
  bladeRough: { repeat: 1, clamp: true },
  glow: { repeat: 1, srgb: true, clamp: true },
  flakeC: { repeat: 1, srgb: true },
  flakeR: { repeat: 1 },
  engraveN: { repeat: 3 },
  engraveC: { repeat: 3, srgb: true },
}

/** Empty textures the materials can hold until the worker's pixels arrive. */
function makeTextureSlots(anisotropy) {
  const slots = {}
  for (const [name, spec] of Object.entries(TEXTURE_SPEC)) {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1)
    t.wrapS = spec.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    t.wrapT = spec.clamp || spec.clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    t.repeat.set(spec.repeat, spec.clampV ? 1 : spec.repeat)
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.generateMipmaps = true
    t.anisotropy = anisotropy
    if (spec.srgb) t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    slots[name] = t
  }
  return slots
}

/** Pours the generated pixels into the slots (clones share the pixels). */
function fillTextureSlots(slots, maps) {
  if (!maps) return
  for (const [name, t] of Object.entries(slots)) {
    const m = maps[name]
    if (!m) continue
    t.image = { data: m.data, width: m.w, height: m.h }
    t.needsUpdate = true
  }
}

/** Smooth 1D value noise, for patchy edge wear along a plate. */
function wearNoise(x) {
  const i = Math.floor(x)
  const f = x - i
  const h = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return v - Math.floor(v)
  }
  return h(i) + (h(i + 1) - h(i)) * f * f * (3 - 2 * f)
}

/** Pushes cloth-like folds into a cylinder: bunched rings and soft creases. */
function foldCloth(geo, height, { rings = [], creases = 0.03, seed = 1 } = {}) {
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = v.y / height + 0.5
    const a = Math.atan2(v.x, v.z)
    let k =
      1 +
      creases *
        Math.sin(a * 5 + seed + Math.sin(t * 7 + seed) * 1.5) *
        (0.4 + 0.6 * Math.sin(Math.PI * t))
    for (const [at, amp, width] of rings) k += amp * Math.exp(-(((t - at) / width) ** 2))
    pos.setXYZ(i, v.x * k, v.y, v.z * k)
  }
  geo.computeVertexNormals()
  return geo
}

/* ================================================================
   Geometry builders
   ================================================================ */

/**
 * A curved armour plate with real thickness and softened edges: an annular
 * sector extruded vertically, then tapered so it can flare like a skirt.
 * `rTop` / `rBottom` are the outer surface; thickness goes inward.
 *
 * UVs: in 'world' mode they are world-scale (UV_SCALE per unit) along the
 * arc and up the plate, so tiled detail keeps one size on every plate; in
 * 'lame' mode u runs along the arc (KOZANE_TILE per texture) and v from the
 * plate's bottom (0) to its top (1), so each lame carries one row of kozane.
 * A per-vertex `wear` value marks the edges and corners, where lacquer rubs
 * through and iron is polished bright; it is turned into vertex colour when
 * the part is baked.
 */
function shellGeometry(rTop, rBottom, height, [start, sweep], thickness, segs, uvMode = 'world') {
  const r = (rTop + rBottom) / 2
  const inner = r - thickness
  const bevelThickness = Math.min(thickness * 0.5, height * 0.25)
  const bevelSize = thickness * 0.32

  // Points are (sin θ, -cos θ) so the -90° turn about X below lands them on
  // (sin θ, ·, cos θ) — the same theta convention as CylinderGeometry.
  const shape = new THREE.Shape()
  for (let i = 0; i <= segs; i++) {
    const a = start + (sweep * i) / segs
    if (i === 0) shape.moveTo(Math.sin(a) * r, -Math.cos(a) * r)
    else shape.lineTo(Math.sin(a) * r, -Math.cos(a) * r)
  }
  for (let i = segs; i >= 0; i--) {
    const a = start + (sweep * i) / segs
    shape.lineTo(Math.sin(a) * inner, -Math.cos(a) * inner)
  }
  shape.closePath()

  const depth = Math.max(height - bevelThickness * 2, 0.002)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 3,
    curveSegments: 1,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getY(i) / height + 0.5, 0, 1)
    const k = (rBottom + (rTop - rBottom) * t) / r
    pos.setX(i, pos.getX(i) * k)
    pos.setZ(i, pos.getZ(i) * k)
  }

  const uv = geo.attributes.uv
  const wear = new Float32Array(pos.count)
  const full = sweep >= Math.PI * 1.99
  const seed = (rTop * 97 + height * 131 + sweep * 17) % 50
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const a = Math.atan2(x, pos.getZ(i))
    const along = a * r
    if (uvMode === 'lame') uv.setXY(i, along / KOZANE_TILE, clamp(y / height + 0.5, 0, 1))
    else uv.setXY(i, along * UV_SCALE, y * UV_SCALE)
    const edgeY = THREE.MathUtils.smoothstep(Math.abs(y) / (height / 2), 0.55, 1)
    const edgeA = full ? 0 : THREE.MathUtils.smoothstep(Math.abs(a) / (sweep / 2), 0.8, 1)
    const patch = 0.2 + 0.8 * wearNoise(along * 38 + seed) * wearNoise(along * 11 + y * 25 + seed * 3)
    wear[i] = Math.max(edgeY, edgeA) * patch
  }
  geo.setAttribute('wear', new THREE.BufferAttribute(wear, 1))

  const creased = toCreasedNormals(geo, 0.9)
  if (creased !== geo) geo.dispose()
  return creased
}

/** Shrinks a tube toward its end — horns and ribs taper, they aren't pipes. */
function taperTube(geo, curve, tubular, radial, taper) {
  const pos = geo.attributes.position
  const p = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, p)
    const k = taper(i / tubular)
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j
      v.fromBufferAttribute(pos, idx).sub(p).multiplyScalar(k).add(p)
      pos.setXYZ(idx, v.x, v.y, v.z)
    }
  }
  geo.computeVertexNormals()
  return geo
}

/** Bakes copies of `base` at each matrix into a single geometry. */
function mergeCopies(base, matrices) {
  const parts = matrices.map((m) => base.clone().applyMatrix4(m))
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * A katana blade with sori (curvature) and a swept kissaki point. UVs are
 * remapped into blade space (spine → edge, tang → tip) so the hamon texture
 * lands where a real temper line would.
 */
function bladeGeometry(length) {
  const w0 = 0.078
  const w1 = 0.062
  const point = 0.17
  const width = (y) => w0 + (w1 - w0) * (y / length)
  const bend = (y) => -0.09 * (y / length) ** 2
  const spine = (y) => bend(y) - width(y) / 2
  const edge = (y) => bend(y) + width(y) / 2

  const shape = new THREE.Shape()
  shape.moveTo(spine(0), 0)
  for (let i = 1; i <= 24; i++) {
    const y = (length * i) / 24
    shape.lineTo(spine(y), y)
  }
  shape.lineTo(spine(length) + 0.006, length + 0.035)
  const yp = length - point
  shape.quadraticCurveTo(edge(length) + 0.004, length, edge(yp), yp)
  for (let i = 23; i >= 0; i--) {
    const y = (yp * i) / 23
    shape.lineTo(edge(y), y)
  }
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.0065,
    bevelSegments: 3,
    curveSegments: 16,
  })
  geo.translate(0, 0, -0.005)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const y = clamp(pos.getY(i), 0, length)
    const s = spine(y)
    const e = edge(y)
    uv.setXY(i, clamp((pos.getX(i) - s) / (e - s), 0, 1), pos.getY(i) / (length + 0.035))
  }
  const creased = toCreasedNormals(geo, 0.7)
  if (creased !== geo) geo.dispose()
  return creased
}

/**
 * The maedate: two broad blades rising from the centre and sweeping out to
 * points, cut from one flat plate with softened edges. Crest space: the boss
 * sits at the origin, the plate faces +Z, and the blade tips reach ±0.86.
 */
function crestGeometry() {
  const P = [
    [0.04, 0.03],
    [0.3, 0.08],
    [0.42, 0.55],
    [0.86, 0.84],
  ]
  const at = (t, i) =>
    (1 - t) ** 3 * P[0][i] + 3 * (1 - t) ** 2 * t * P[1][i] + 3 * (1 - t) * t * t * P[2][i] + t ** 3 * P[3][i]
  const slope = (t, i) =>
    3 * (1 - t) ** 2 * (P[1][i] - P[0][i]) + 6 * (1 - t) * t * (P[2][i] - P[1][i]) + 3 * t * t * (P[3][i] - P[2][i])
  // Broad at the root, narrower through the sweep, flaring into the blade,
  // then running out to a point.
  const widths = [
    [0, 0.17],
    [0.35, 0.12],
    [0.7, 0.18],
    [0.88, 0.14],
    [1, 0],
  ]
  const widthAt = (t) => {
    for (let i = 1; i < widths.length; i++) {
      if (t <= widths[i][0]) {
        const [t0, w0] = widths[i - 1]
        const [t1, w1] = widths[i]
        return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0)
      }
    }
    return 0
  }
  const N = 32
  const inner = []
  const outer = []
  for (let k = 0; k <= N; k++) {
    const t = k / N
    const x = at(t, 0)
    const y = at(t, 1)
    let tx = slope(t, 0)
    let ty = slope(t, 1)
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    const hw = widthAt(t) / 2
    inner.push([x - ty * hw, y + tx * hw])
    outer.push([x + ty * hw, y - tx * hw])
  }
  const shape = new THREE.Shape()
  shape.moveTo(outer[0][0], outer[0][1])
  for (let k = 1; k <= N; k++) shape.lineTo(outer[k][0], outer[k][1])
  for (let k = N - 1; k >= 0; k--) shape.lineTo(inner[k][0], inner[k][1])
  for (let k = 0; k <= N; k++) shape.lineTo(-inner[k][0], inner[k][1])
  for (let k = N - 1; k >= 0; k--) shape.lineTo(-outer[k][0], outer[k][1])
  shape.quadraticCurveTo(0, -0.14, outer[0][0], outer[0][1])
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 8,
  })
  geo.translate(0, 0, -0.013)
  const creased = toCreasedNormals(geo, 0.6)
  if (creased !== geo) geo.dispose()
  return creased
}

/** A sunburst of broad pointed rays, long and short by turns, as a thin gilt plate. */
function sunburstGeometry() {
  const shape = new THREE.Shape()
  // Broad, pointed petal rays, as brushed in gold leaf
  const rays = 12
  for (let i = 0; i <= rays * 2; i++) {
    const a = (i / (rays * 2)) * Math.PI * 2 + 0.16
    const r = i % 2 ? 0.03 : i % 4 === 0 ? 0.08 : 0.06
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.003,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0012,
    bevelSegments: 1,
  })
  const creased = toCreasedNormals(geo, 0.6)
  if (creased !== geo) geo.dispose()
  return creased
}

/** A round tsuba pierced with four sukashi openings. */
function tsubaGeometry(radius, depth) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const hole = new THREE.Path()
    hole.absarc(Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62, radius * 0.15, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 36,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateX(Math.PI / 2)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * UV_SCALE, uv.getY(i) * UV_SCALE)
  const creased = toCreasedNormals(geo, 0.8)
  if (creased !== geo) geo.dispose()
  return creased
}

/* ================================================================
   Moods, actions and the arm rig
   ================================================================ */

// Poses are authored in body space: origin at the hips, +Y up, +Z forward,
// +X toward the katana hand. Hands are IK targets for the centre of the fist;
// the blade is a direction plus the way its edge faces.
const SHOULDER_X = 0.46
const SHOULDER_Y = 0.72
const UPPER_ARM = 0.56
const FOREARM = 0.4
// From the katana hand down the grip to where the other hand closes.
const GRIP_SPAN = 0.26

/** Every scalar a pose can set. */
const SCALARS = [
  'lean', // forward bend at the hips
  'twist', // body turn
  'tilt', // body roll
  'crouch', // knee bend
  'splay', // stance width
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
function bladeQuat(dir, edge = [0, 0, 1]) {
  const y = new THREE.Vector3(...dir).normalize()
  const x = new THREE.Vector3(...edge)
  for (const fallback of [null, [0, -1, 0], [1, 0, 0]]) {
    if (fallback) x.set(...fallback)
    x.addScaledVector(y, -x.dot(y))
    if (x.lengthSq() > 1e-4) break
  }
  x.normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

// The original relaxed pose, measured off the rig: arm hanging with a slight
// outward splay, katana held low and out to the side.
const REST = (() => {
  const qS = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.16))
  const qE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0))
  const qK = new THREE.Quaternion().setFromEuler(new THREE.Euler(KATANA_TILT, 0, Math.PI + 0.58))
  const hand = new THREE.Vector3(0, -FOREARM, 0)
    .applyQuaternion(qE)
    .add(new THREE.Vector3(0, -UPPER_ARM, 0))
    .applyQuaternion(qS)
    .add(new THREE.Vector3(SHOULDER_X, SHOULDER_Y, 0))
  return { hand, blade: qS.clone().multiply(qE).multiply(qK) }
})()

/** Where a hanging hand ends up, in body space, when the body leans forward. */
const hangingHand = (side, lean) => {
  const rel = new THREE.Vector3(REST.hand.x - SHOULDER_X, REST.hand.y - SHOULDER_Y, REST.hand.z)
  rel.applyAxisAngle(new THREE.Vector3(1, 0, 0), -lean)
  return [side * (SHOULDER_X + rel.x), SHOULDER_Y + rel.y, rel.z]
}

const CALM = {
  lean: 0,
  twist: 0,
  tilt: 0,
  crouch: 0,
  splay: 0.05,
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

const MOOD_POSES = {
  // The relaxed idle he has always had.
  calm: {},
  // Free hand to the chin, head cocked, gaze drifting.
  thinking: {
    L: [-0.13, 0.58, 0.56],
    blade: [[0.32, -0.92, 0.22]],
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
  // Chudan: both hands on the grip, the point level with his chin and
  // aimed ahead, so the blade never covers his eyes.
  focused: {
    R: [0.04, 0.2, 0.62],
    blade: [
      [0.2, 0.42, 0.88],
      [0, -0.9, 0.42],
    ],
    twoHand: 1,
    lean: 0.06,
    crouch: 0.14,
    splay: 0.1,
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
    R: [-0.08, 0.28, 0.62],
    blade: [[0.72, 0.56, 0.42]],
    twoHand: 1,
    lean: 0.1,
    crouch: 0.24,
    splay: 0.16,
    eyeOpen: 0.55,
    eyeGlow: 1.35,
    eyeTilt: 0.2,
    heat: 0.45,
    sway: 0.5,
    breathRate: 1.9,
    breathDepth: 0.018,
    lookGain: 0.85,
  },
  // Blade raised high, free fist on the hip, chin up.
  victory: {
    R: [0.9, 1.2, 0.14],
    blade: [[0.2, 0.97, 0.1]],
    L: [-0.5, 0.06, 0.16],
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
// his mood calls for. A key sets only what it names; the rest follows the mood.
const ACTION_DEFS = {
  // A single diagonal cut: wind up over the shoulder, cut through, hold.
  slash: {
    duration: 0.95,
    keys: [
      {
        t: 0.26,
        R: [0.66, 0.85, 0.02],
        blade: [[0.45, 0.6, -0.66]],
        L: [-0.3, 0.3, 0.5],
        twoHand: 0,
        twist: 0.25,
        lean: -0.04,
        crouch: 0.12,
        eyeGlow: 1.25,
      },
      {
        t: 0.46,
        R: [-0.1, 0.12, 0.62],
        blade: [[-0.55, -0.45, 0.7]],
        L: [-0.45, -0.1, 0.35],
        twoHand: 0,
        twist: -0.28,
        lean: 0.16,
        crouch: 0.22,
        glint: 1,
        eyeGlow: 1.6,
        eyeOpen: 0.5,
        eyeTilt: 0.2,
      },
      {
        t: 0.7,
        R: [-0.1, 0.12, 0.62],
        blade: [[-0.55, -0.45, 0.7]],
        L: [-0.45, -0.1, 0.35],
        twoHand: 0,
        twist: -0.24,
        lean: 0.14,
        crouch: 0.2,
        glint: 0.3,
        eyeGlow: 1.3,
      },
    ],
  },
  // The hidden one: a draw-cut from a low guard, then the flick to clear the blade.
  draw: {
    duration: 1.6,
    keys: [
      {
        t: 0.14,
        R: [0.52, 0.1, 0.32],
        blade: [[0.3, -0.35, -0.89]],
        L: [-0.35, 0.25, 0.48],
        twoHand: 0,
        crouch: 0.26,
        twist: 0.2,
        lean: 0.1,
        eyeOpen: 0.5,
        eyeGlow: 1.1,
      },
      {
        t: 0.34,
        R: [0.1, 0.4, 0.72],
        blade: [[-0.75, 0.05, 0.66]],
        L: [-0.55, 0.15, 0.2],
        twoHand: 0,
        twist: -0.3,
        lean: 0.12,
        crouch: 0.2,
        glint: 1,
        eyeGlow: 1.7,
        eyeOpen: 0.45,
        eyeTilt: 0.22,
        heat: 0.5,
      },
      {
        t: 0.5,
        R: [0.1, 0.4, 0.72],
        blade: [[-0.75, 0.05, 0.66]],
        L: [-0.55, 0.15, 0.2],
        twoHand: 0,
        twist: -0.28,
        lean: 0.1,
        crouch: 0.18,
        glint: 0.6,
        eyeGlow: 1.5,
        eyeOpen: 0.5,
        heat: 0.4,
      },
      {
        t: 0.72,
        R: [0.62, 0.05, 0.38],
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
  // S — whirlwind: wind up, then a full turn with the blade held out flat,
  // finishing in a low guard.
  spin: {
    duration: 1.6,
    spin: [0.24, 0.72, -Math.PI * 2],
    keys: [
      {
        t: 0.18,
        R: [0.5, 0.42, 0.34],
        blade: [[0.55, 0.05, -0.83]],
        L: [-0.45, 0.32, 0.32],
        twoHand: 0,
        crouch: 0.22,
        twist: 0.4,
        lean: 0.06,
        eyeGlow: 1.3,
        lookGain: 0,
      },
      {
        t: 0.3,
        R: [0.66, 0.5, 0.14],
        blade: [[1, 0.04, 0.12]],
        L: [-0.55, 0.3, 0.1],
        twoHand: 0,
        crouch: 0.16,
        twist: 0,
        lean: 0,
        glint: 1,
        eyeGlow: 1.6,
        eyeOpen: 0.5,
        eyeTilt: 0.18,
        lookGain: 0,
      },
      {
        t: 0.68,
        R: [0.66, 0.5, 0.14],
        blade: [[1, 0.04, 0.12]],
        L: [-0.55, 0.3, 0.1],
        twoHand: 0,
        crouch: 0.16,
        glint: 1,
        eyeGlow: 1.6,
        eyeOpen: 0.5,
        lookGain: 0,
      },
      {
        t: 0.84,
        R: [0.4, 0.2, 0.55],
        blade: [[0.4, -0.5, 0.77]],
        L: [-0.45, 0.2, 0.36],
        twoHand: 0,
        crouch: 0.24,
        lean: 0.1,
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
        R: [0.52, 0.24, 0.32],
        blade: [[0.4, -0.6, 0.69]],
        L: [-0.5, 0.24, 0.3],
        twoHand: 0,
        crouch: 0.34,
        lean: 0.16,
        lift: 0,
        eyeGlow: 1.1,
      },
      {
        t: 0.42,
        R: [0.86, 1.18, 0.12],
        blade: [[0.18, 0.97, 0.12]],
        L: [-0.62, 0.9, 0.14],
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
        R: [0.86, 1.18, 0.12],
        blade: [[0.18, 0.97, 0.12]],
        L: [-0.62, 0.9, 0.14],
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
        R: [0.55, 0.3, 0.46],
        blade: [[0.5, -0.3, 0.81]],
        L: [-0.46, 0.22, 0.4],
        twoHand: 0,
        crouch: 0.3,
        lean: 0.14,
        lift: 0,
        eyeGlow: 1.2,
      },
    ],
  },
  // T — thrust: draw the hands back, then lunge forward, both hands on the
  // grip, driving the point straight at the viewer.
  thrust: {
    duration: 1.3,
    keys: [
      {
        t: 0.22,
        R: [0.12, 0.28, 0.72],
        blade: [[0, 0.12, 1], [0, -1, 0]],
        twoHand: 1,
        crouch: 0.18,
        twist: 0.18,
        lean: 0.02,
        eyeOpen: 0.55,
        eyeGlow: 1.2,
        eyeTilt: 0.16,
      },
      {
        t: 0.4,
        R: [0.05, 0.32, 0.98],
        blade: [[0, 0.05, 1], [0, -1, 0]],
        twoHand: 1,
        crouch: 0.3,
        splay: 0.2,
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
        t: 0.62,
        R: [0.05, 0.32, 0.98],
        blade: [[0, 0.05, 1], [0, -1, 0]],
        twoHand: 1,
        crouch: 0.28,
        splay: 0.2,
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
        R: [0.1, 0.34, 0.66],
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
        R: [0.1, 0.34, 0.66],
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
}

function makePose() {
  return {
    s: { ...CALM },
    R: REST.hand.clone(),
    L: REST.hand.clone().setX(-REST.hand.x),
    q: REST.blade.clone(),
  }
}

function copyPose(dst, src) {
  for (const k of SCALARS) dst.s[k] = src.s[k]
  dst.R.copy(src.R)
  dst.L.copy(src.L)
  dst.q.copy(src.q)
  return dst
}

const MOOD_TARGETS = Object.fromEntries(
  Object.entries(MOOD_POSES).map(([mood, def]) => {
    const p = makePose()
    for (const k of SCALARS) if (k in def) p.s[k] = def[k]
    if (def.R) p.R.set(...def.R)
    if (def.L) p.L.set(...def.L)
    if (def.blade) p.q.copy(bladeQuat(...def.blade))
    return [mood, p]
  })
)

const ACTIONS = Object.fromEntries(
  Object.entries(ACTION_DEFS).map(([name, def]) => [
    name,
    {
      duration: def.duration,
      spin: def.spin || null,
      keys: def.keys.map((k) => {
        const s = {}
        for (const ch of SCALARS) if (ch in k) s[ch] = k[ch]
        let q = null
        if (k.blade) q = bladeQuat(...k.blade)
        else if (k.bladeLean) {
          // The resting blade, carried forward with the bow.
          q = new THREE.Quaternion()
            .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -k.bladeLean)
            .multiply(REST.blade)
        }
        return {
          t: k.t,
          partial: true,
          s,
          R: k.R ? new THREE.Vector3(...k.R) : null,
          L: k.L ? new THREE.Vector3(...k.L) : null,
          q,
        }
      }),
    },
  ])
)

/* ---- Arm IK that knows where the body is ---- */

// Where each elbow points by default: down, out and back, as a relaxed arm's
// does. [viewer's left arm, katana arm]
const ARM_POLES = [-1, 1].map((side) => new THREE.Vector3(side * 0.5, -0.5, -0.7).normalize())
// Swivel angles to try around the reach, nearest the default first.
const SWIVELS = [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05, 1.31, -1.31, 1.57, -1.57]

/**
 * The body, in body space, as an elliptic column: the dō above the waist,
 * flaring over the kusazuri below it. Radii are the armour's surface.
 */
function bodyRadii(y) {
  const t = clamp((0.05 - y) / 0.5, 0, 1)
  return [0.4 + 0.1 * t, 0.33 + 0.08 * t]
}

/** How deep a sphere of radius r at p sits inside the body; 0 when clear. */
function penetration(p, r) {
  if (p.y < -0.5 || p.y > 0.86) return 0
  const [bx, bz] = bodyRadii(p.y)
  return Math.max(0, 1 - Math.hypot(p.x / (bx + r), p.z / (bz + r)))
}

/** Moves a hand target straight out to the body's surface if it is inside. */
function keepOutOfBody(p, r) {
  if (p.y < -0.5 || p.y > 0.86) return p
  const [bx, bz] = bodyRadii(p.y)
  const q = Math.hypot(p.x / (bx + r), p.z / (bz + r))
  if (q >= 1) return p
  if (q < 1e-4) p.z = bz + r
  else {
    p.x /= q
    p.z /= q
  }
  return p
}

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

/** How much of an arm (elbow half of the upper arm, and the forearm) is in the body. */
function armPenetration(swivel, cosA, sinA) {
  const { S, T, q } = ik_
  const E = elbowAt(swivel, cosA, sinA)
  let pen = 0
  for (const t of [0.55, 0.8, 1]) pen += penetration(q.lerpVectors(S, E, t), 0.09)
  for (const t of [0.3, 0.55, 0.8]) pen += penetration(q.lerpVectors(E, T, t), 0.085)
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
function solveArm(target, side, state, dt, out) {
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
    const score = armPenetration(sw, cosA, sinA) + Math.abs(sw) * 0.015
    if (score < bestScore) {
      bestScore = score
      best = sw
    }
  }
  state.swivel += (best - state.swivel) * (dt > 0 ? 1 - Math.exp(-10 * dt) : 1)

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

/** Critically damped spring, solved exactly, so it is stable at any frame rate. */
const springOut = { x: 0, v: 0 }
function spring(x, v, target, omega, dt) {
  const y = x - target
  const e = Math.exp(-omega * dt)
  const k = (v + omega * y) * dt
  springOut.x = target + (y + k) * e
  springOut.v = (v - omega * k) * e
  return springOut
}

export default function Samurai3D() {
  const slotRef = useRef(null)
  const frameRef = useRef(null)
  const mountRef = useRef(null)
  const hitRef = useRef(null)
  const dismissRef = useRef(null)
  const [tip, setTip] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return
    }

    let disposed = false
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const dpr = Math.min(window.devicePixelRatio, 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    // Kept under 1: ACES desaturates saturated reds toward coral as they
    // approach clipping. A darker exposure keeps the lacquer red.
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = true
    // Not PCFSoftShadowMap: three.js r18x silently swaps that for PCF at
    // render time, which changes every shader's cache key and throws away the
    // programs compiled ahead of time. `key.shadow.radius` still softens PCF.
    renderer.shadowMap.type = THREE.PCFShadowMap
    mount.appendChild(renderer.domElement)
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      31,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(1.4, 2.6, 8.8)

    /* ================================================================
       Studio lighting: warm key, two cool rims, dim fill
       ================================================================ */
    // The reflection map arrives asynchronously (see start() below). Metals
    // are lit mostly by what they reflect, so it carries more weight than it
    // would in a matte scene.
    scene.environmentIntensity = 0.62
    let envTexture = null
    let envFallback = null

    const key = new THREE.DirectionalLight(0xfff3e6, 2.5)
    key.position.set(3.6, 6.5, 5.2)
    key.castShadow = true
    key.shadow.mapSize.setScalar(finePointer ? 4096 : 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -4
    key.shadow.camera.right = 4
    key.shadow.camera.top = 6
    key.shadow.camera.bottom = -1.5
    key.shadow.bias = -0.0006
    key.shadow.normalBias = 0.018
    key.shadow.radius = finePointer ? 7 : 4

    const rimL = new THREE.DirectionalLight(0xa8c8ff, 2.3)
    rimL.position.set(-4.5, 3.5, -5)
    const rimR = new THREE.DirectionalLight(0xbcd4ff, 1.5)
    rimR.position.set(4.5, 2.5, -4.5)
    const fill = new THREE.DirectionalLight(0xdfe7f5, 0.3)
    fill.position.set(-3.5, 1.2, 4)
    scene.add(key, rimL, rimR, fill)

    /* ---- Controls ---- */
    const STAND_TARGET_Y = 1.95
    const SIT_TARGET_Y = 1.62
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, STAND_TARGET_Y, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = 0.85
    controls.minPolarAngle = 0.35
    controls.maxPolarAngle = Math.PI / 2 + 0.3
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.7

    // Touch drags orbit as well. OrbitControls otherwise pins the canvas to
    // `touch-action: none`, which swallows page scrolling, so it is put back
    // to `pan-y`: a sideways drag spins the samurai, while a vertical swipe
    // is claimed by the browser to scroll and cancels the drag mid-gesture.
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null }
    renderer.domElement.style.touchAction = 'pan-y'

    let interacting = false
    let autoSpin = true
    let resumeTimer
    controls.addEventListener('start', () => {
      interacting = true
      autoSpin = false
      clearTimeout(resumeTimer)
    })
    controls.addEventListener('end', () => {
      interacting = false
      resumeTimer = setTimeout(() => {
        autoSpin = true
      }, 2500)
    })

    /* ================================================================
       Materials — four shader programs between them
       ================================================================ */
    const maps = makeTextureSlots(maxAnisotropy)
    const geos = new Set()
    const track = (g) => {
      geos.add(g)
      return g
    }
    // A map reused at a different scale shares its pixels and GPU memory.
    const extraMaps = []
    const scaled = (t, repeat) => {
      const c = t.clone()
      c.repeat.set(repeat, repeat)
      c.needsUpdate = true
      extraMaps.push(c)
      return c
    }
    const flat = (k) => new THREE.Vector2(k, k)

    // three.js compiles one program per distinct feature set, and on many
    // GPUs each compile costs hundreds of milliseconds. Every material below
    // is one of three families with identical map slots, so they share
    // programs: vary colours, scalars and which texture fills a slot freely,
    // but keep the slots the same (and keep clearcoat / sheen above zero,
    // since zero drops the feature).

    // Urushi lacquer (and waxed leather, and the lacquered wooden saya):
    // pigment over a finely textured base, under a smooth hard clear coat.
    const lacquered = (token, fallback, extra = {}) => {
      const m = new THREE.MeshPhysicalMaterial({
        color: cssColor(token, fallback),
        metalness: 0,
        roughness: 0.36,
        clearcoat: 1,
        clearcoatRoughness: 0.09,
        ior: 1.55,
        envMapIntensity: 0.6,
        map: maps.mottle,
        roughnessMap: maps.grain,
        normalMap: maps.lacquerN,
        normalScale: flat(0.35),
        vertexColors: true,
        ...extra,
      })
      m.userData.wear = -0.42 // worn edges show the darker ground coat
      return m
    }

    // Metals: forged iron with hammer marks, dents and scratches; gold; steel.
    const metallic = (token, fallback, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({
        color: cssColor(token, fallback),
        metalness: 0.88,
        map: maps.mottle,
        roughnessMap: maps.ironR,
        normalMap: maps.ironN,
        normalScale: flat(0.55),
        vertexColors: true,
        ...extra,
      })
      m.userData.wear = 0.3 // edges rubbed bright
      return m
    }

    // Fabric, silk braid, straw and mail: a woven relief with a soft sheen.
    const woven = (token, fallback, extra = {}) =>
      new THREE.MeshPhysicalMaterial({
        color: cssColor(token, fallback),
        metalness: 0,
        roughness: 0.9,
        sheen: 1,
        sheenRoughness: 0.6,
        map: maps.fabricTone,
        normalMap: maps.weaveN,
        normalScale: flat(0.8),
        ...extra,
      })

    const mats = {
      fabric: woven('--samurai-fabric', '#171a21', {
        roughness: 0.95,
        sheenColor: new THREE.Color(0x4a5566),
      }),
      cloth: woven('--samurai-cloth', '#a8322a', {
        sheenColor: new THREE.Color(0xff9d8a),
        normalScale: flat(0.5),
      }),
      rope: woven('--samurai-rope', '#b8935a', {
        roughness: 0.58,
        sheenRoughness: 0.35,
        sheenColor: new THREE.Color(0xfff0d8),
        normalMap: maps.braidN,
        normalScale: flat(0.9),
      }),
      straw: woven('--samurai-rope', '#b8935a', {
        roughness: 0.92,
        sheen: 0.3,
        normalMap: maps.strawN,
        normalScale: flat(1),
      }),
      kusari: woven('--samurai-armor', '#39414f', {
        metalness: 0.8,
        roughness: 0.5,
        sheen: 0.05,
        normalMap: maps.chainN,
        normalScale: flat(1.3),
        envMapIntensity: 1.2,
      }),
      red: lacquered('--samurai-accent', '#c0392b'),
      redDark: lacquered('--samurai-accent-dark', '#8e2a1e'),
      // Laced lames: the same lacquer over rows of individual scales.
      redLame: lacquered('--samurai-accent', '#c0392b', { normalMap: maps.kozaneN, normalScale: flat(0.72) }),
      redDarkLame: lacquered('--samurai-accent-dark', '#8e2a1e', {
        normalMap: maps.kozaneN,
        normalScale: flat(0.72),
      }),
      bowl: lacquered('--samurai-bowl', '#e8e1d4', {
        roughness: 0.4,
        normalMap: scaled(maps.lacquerN, 6),
        normalScale: flat(0.3),
      }),
      leather: lacquered('--samurai-leather', '#4a3b33', {
        roughness: 0.64,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
        envMapIntensity: 1,
        normalMap: maps.leatherN,
        normalScale: flat(0.8),
      }),
      // The saya: black lacquer over wood, the grain just showing through.
      saya: lacquered('--samurai-saya', '#141418', {
        roughness: 0.5,
        clearcoatRoughness: 0.06,
        envMapIntensity: 0.9,
        normalMap: maps.woodN,
        normalScale: flat(0.35),
      }),
      metal: metallic('--samurai-armor', '#39414f', { roughness: 0.44 }),
      metalDark: metallic('--samurai-armor-dark', '#22272f', { roughness: 0.4 }),
      // Polished metals get a stronger reflection than the forged iron.
      gold: metallic('--samurai-gold', '#e0a63a', {
        metalness: 1,
        roughness: 0.26,
        roughnessMap: maps.grain,
        normalScale: flat(0.12),
        envMapIntensity: 1.8,
      }),
      // The blade's colour and roughness both come from the hamon maps.
      steel: metallic('--samurai-steel', '#e9edf4', {
        metalness: 1,
        roughness: 1,
        map: maps.blade,
        roughnessMap: maps.bladeRough,
        normalScale: flat(0.03),
        envMapIntensity: 2.4,
      }),
      // Rides on the metal program: the emissive term is always compiled in.
      eye: metallic('--samurai-eye', '#ffb347', {
        metalness: 0.1,
        roughness: 0.3,
        normalScale: flat(0),
        emissive: cssColor('--samurai-eye', '#ffb347'),
        emissiveIntensity: 0.8,
      }),
    }
    mats.gold.userData.wear = 0.15
    mats.steel.userData.wear = 0
    mats.eye.userData.wear = 0

    // The kabuto and menpō: black urushi flecked with gold leaf. The colour
    // is all in the map (black ground, gold flakes), so the material is white.
    const helmetFinish = (extra) => {
      const m = lacquered('--samurai-helmet-tint', '#ffffff', {
        roughness: 0.34,
        clearcoatRoughness: 0.05,
        envMapIntensity: 0.75,
        map: maps.flakeC,
        roughnessMap: maps.flakeR,
        normalScale: flat(0.25),
        ...extra,
      })
      m.userData.wear = 0.2
      return m
    }
    mats.helmet = helmetFinish()
    // Spheres and tubes carry 0..1 UVs, so they take the flakes at a finer repeat.
    mats.helmetRound = helmetFinish({
      map: scaled(maps.flakeC, 8),
      roughnessMap: scaled(maps.flakeR, 8),
      normalMap: scaled(maps.lacquerN, 6),
    })
    mats.helmetLame = helmetFinish({ normalMap: maps.kozaneN, normalScale: flat(0.72) })
    // The crest: gilt plate, engraved all over.
    mats.crest = metallic('--samurai-gold', '#e0a63a', {
      metalness: 1,
      roughness: 0.3,
      map: maps.engraveC,
      roughnessMap: maps.grain,
      normalMap: maps.engraveN,
      normalScale: flat(0.9),
      envMapIntensity: 1.8,
    })
    mats.crest.userData.wear = 0.1
    mats.helmetLacing = woven('--samurai-helmet-lacing', '#232a3d', {
      roughness: 0.6,
      sheenRoughness: 0.4,
      sheenColor: new THREE.Color(0x6b7a99),
      normalMap: maps.braidN,
      normalScale: flat(0.9),
    })
    // Lames swap in the scale-textured lacquer of the same colour.
    const LAME = new Map([
      [mats.red, mats.redLame],
      [mats.redDark, mats.redDarkLame],
    ])
    const glowMat = new THREE.MeshBasicMaterial({
      map: maps.glow,
      color: cssColor('--samurai-eye', '#ffb347'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    })
    const allMats = [...Object.values(mats), glowMat]

    const samurai = new THREE.Group()
    scene.add(samurai)

    const mesh = (geo, material) => {
      const m = new THREE.Mesh(track(geo), material)
      m.castShadow = true
      m.receiveShadow = true
      return m
    }

    /**
     * A solid curved armour plate. Geometry is built centred on the front and
     * cached by shape, then rotated into place — the six kusazuri panels, both
     * sode and both legs all reuse the same few shells.
     */
    const shellCache = new Map()
    const plate = (
      rTop,
      rBottom,
      height,
      [start, sweep],
      material,
      thickness = 0.026,
      segs = 18,
      uvMode = 'world'
    ) => {
      const key = [rTop, rBottom, height, sweep, thickness, segs].map((v) => v.toFixed(4)).join() + uvMode
      let geo = shellCache.get(key)
      if (!geo) {
        geo = track(shellGeometry(rTop, rBottom, height, arc(0, sweep), thickness, segs, uvMode))
        shellCache.set(key, geo)
      }
      const m = new THREE.Mesh(geo, material)
      m.castShadow = true
      m.receiveShadow = true
      m.rotation.y = start + sweep / 2
      return m
    }

    const STUD = track(new THREE.SphereGeometry(0.026, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2))
    const stud = (parent, x, y, z, rotY = 0, scale = 1) => {
      const s = new THREE.Mesh(STUD, mats.gold)
      s.castShadow = true
      s.position.set(x, y, z)
      s.rotation.set(Math.PI / 2, rotY, 0, 'YXZ')
      s.scale.setScalar(scale)
      parent.add(s)
      return s
    }

    /**
     * Draw calls, not triangles, are what this scene costs on integrated
     * GPUs: every plate, stud and cord is its own mesh, and each is drawn
     * three times a frame (shadow map, normals for AO, colour). Once a rigid
     * part is built, its static meshes are baked into one mesh per material.
     * Nodes listed in `keep` (and everything under them) still animate on
     * their own, so they are left alone.
     */
    const bake = (root, keep = []) => {
      root.updateMatrixWorld(true)
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
      const byMaterial = new Map()
      const sources = []
      root.traverse((o) => {
        if (!o.isMesh || keep.includes(o)) return
        for (let p = o.parent; p && p !== root; p = p.parent) if (keep.includes(p)) return
        const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
        if (o.material.vertexColors) paintWear(g, o.material.userData.wear || 0, o.matrixWorld)
        g.deleteAttribute('wear')
        g.applyMatrix4(local)
        if (!byMaterial.has(o.material)) byMaterial.set(o.material, [])
        byMaterial.get(o.material).push(g)
        sources.push(o)
      })
      const merged = []
      for (const [material, parts] of byMaterial) {
        const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts)
        if (parts.length > 1) parts.forEach((g) => g.dispose())
        if (!geo) {
          // Incompatible attributes: leave this part as separate meshes.
          merged.forEach((m) => m.geometry.dispose())
          return
        }
        merged.push(mesh(geo, material))
      }
      sources.forEach((o) => o.parent.remove(o))
      merged.forEach((m) => root.add(m))
    }

    /**
     * Weathering, as vertex colour: plate edges and corners rub through the
     * lacquer (or polish the iron bright), and dust settles on whatever is
     * close to the ground. Positions are taken in the standing pose.
     */
    const DUST = new THREE.Color(0.8, 0.74, 0.64)
    const wearPoint = new THREE.Vector3()
    const paintWear = (g, amount, world) => {
      const pos = g.attributes.position
      const wear = g.attributes.wear
      const colors = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        wearPoint.fromBufferAttribute(pos, i).applyMatrix4(world)
        const dust = THREE.MathUtils.smoothstep(0.6 - wearPoint.y, 0, 0.6) * 0.45
        const k = 1 + amount * (wear ? wear.getX(i) : 0)
        colors[i * 3] = k * (1 + (DUST.r - 1) * dust)
        colors[i * 3 + 1] = k * (1 + (DUST.g - 1) * dust)
        colors[i * 3 + 2] = k * (1 + (DUST.b - 1) * dust)
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    }

    /* ---- Silk lacing: every cord of a group merged into one mesh ---- */
    // Each segment is [from, to, outwardNormal]. The braid is flattened
    // against the plate it crosses, so it reads as lacing, not as dowels.
    const CORD = track(new THREE.CylinderGeometry(0.0085, 0.0085, 1, 6, 1))
    const lace = (parent, segments, material = mats.rope) => {
      if (!segments.length) return
      const x = new THREE.Vector3()
      const y = new THREE.Vector3()
      const z = new THREE.Vector3()
      const mid = new THREE.Vector3()
      const size = new THREE.Vector3()
      const matrices = segments.map(([a, b, n]) => {
        y.subVectors(b, a)
        const len = y.length()
        y.normalize()
        z.copy(n).addScaledVector(y, -n.dot(y)).normalize()
        x.crossVectors(y, z).normalize()
        mid.addVectors(a, b).multiplyScalar(0.5)
        const m = new THREE.Matrix4().makeBasis(x, y, z)
        m.setPosition(mid)
        return m.scale(size.set(1.5, len, 0.55))
      })
      parent.add(mesh(mergeCopies(CORD, matrices), material))
    }

    /**
     * Rows of lames laced together with pairs of silk braid — how sode,
     * kusazuri and shikoro are really built. The radius grows linearly
     * downward by `flare`, so the rows open out like a skirt. The bottom
     * lame is finished with hishinui cross-knots.
     */
    const lamellar = (
      parent,
      {
        rows,
        rowH,
        gap,
        rTop,
        flare,
        span,
        y = 0,
        material,
        trim,
        topTrim,
        hang = 0,
        cordsPer = 3,
        thickness = 0.024,
        cross = true,
        lacing = mats.rope,
      }
    ) => {
      const group = new THREE.Group()
      group.position.y = y
      parent.add(group)

      const rAt = (yy) => rTop - flare * yy
      const cordAt = (a, yy) => {
        const r = rAt(yy) + thickness * 0.32 + 0.003
        return new THREE.Vector3(Math.sin(a) * r, yy, Math.cos(a) * r)
      }
      const normalAt = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
      const [start, sweep] = span
      const segments = []
      const pairs = (yA, yB) => {
        for (let k = 0; k < cordsPer; k++) {
          const a = start + (sweep * (k + 0.5)) / cordsPer
          const spread = 0.02 / rAt(yA)
          for (const o of [-spread, spread]) {
            segments.push([cordAt(a + o, yA), cordAt(a + o, yB), normalAt(a + o)])
          }
        }
      }

      let bottom = 0
      for (let i = 0; i < rows; i++) {
        const top = -i * (rowH + gap)
        bottom = top - rowH
        const mat = Array.isArray(material) ? material[i % material.length] : material
        const lame = plate(rAt(top), rAt(bottom), rowH, span, LAME.get(mat) || mat, thickness, 18, 'lame')
        lame.position.y = top - rowH / 2
        group.add(lame)
        if (i < rows - 1) pairs(bottom + rowH * 0.3, bottom - gap - rowH * 0.3)
      }
      if (hang) pairs(hang, -rowH * 0.3)
      if (cross) {
        for (let k = 0; k < cordsPer; k++) {
          const a = start + (sweep * (k + 0.5)) / cordsPer
          const o = 0.03 / rAt(bottom)
          const n = normalAt(a)
          const hi = bottom + rowH * 0.56
          const lo = bottom + rowH * 0.12
          segments.push(
            [cordAt(a - o, hi), cordAt(a + o, lo), n],
            [cordAt(a + o, hi), cordAt(a - o, lo), n]
          )
        }
      }
      lace(group, segments, lacing)

      if (trim) {
        const edge = plate(
          rAt(bottom + 0.018) + 0.006,
          rAt(bottom) + 0.006,
          0.018,
          span,
          trim,
          thickness + 0.012
        )
        edge.position.y = bottom + 0.009
        group.add(edge)
      }
      if (topTrim) {
        const edge = plate(rAt(0) + 0.006, rAt(-0.018) + 0.006, 0.018, span, topTrim, thickness + 0.012)
        edge.position.y = -0.009
        group.add(edge)
      }
      return group
    }

    /* ================================================================
       Legs — fabric underneath, laced thigh lames, splinted mail shins.
       Hip, knee and ankle each bend, so he can kneel into seiza.
       ================================================================ */
    const legs = [-1, 1].map((side) => {
      const hip = new THREE.Group()
      hip.position.set(side * 0.32, HIP_Y, 0)
      // Splay (Y) is applied outside the lift (X), so a raised thigh still
      // swings out sideways rather than twisting.
      hip.rotation.order = 'YXZ'
      samurai.add(hip)

      const thigh = mesh(
        foldCloth(new THREE.CylinderGeometry(0.18, 0.16, 0.46, 40, 12), 0.46, {
          rings: [
            [0.1, 0.05, 0.08],
            [0.22, -0.02, 0.06],
          ],
          creases: 0.035,
          seed: side + 3,
        }),
        mats.fabric
      )
      thigh.position.y = -0.25
      hip.add(thigh)

      // Haidate: three small laced lames over the front of the thigh
      lamellar(hip, {
        rows: 3,
        rowH: 0.072,
        gap: 0.018,
        rTop: 0.2,
        flare: 0.08,
        span: arc(FRONT, Math.PI * 0.62),
        y: -0.07,
        material: [mats.red, mats.red, mats.redDark],
        trim: mats.gold,
        hang: 0.05,
        cordsPer: 2,
      })

      const knee = new THREE.Group()
      knee.position.y = -0.5
      hip.add(knee)

      const kneeCop = mesh(new THREE.SphereGeometry(0.15, 36, 24), mats.red)
      kneeCop.position.set(0, 0, 0.06)
      kneeCop.scale.z = 0.8
      knee.add(kneeCop)

      const kneeTrim = mesh(new THREE.TorusGeometry(0.14, 0.016, 12, 64), mats.gold)
      kneeTrim.position.set(0, 0, 0.13)
      knee.add(kneeTrim)
      stud(knee, 0, 0, 0.175, 0, 0.8)

      // The shin is sleeved in kusari (mail) under the splints
      const shin = mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.4, 40), mats.kusari)
      shin.position.y = -0.27
      knee.add(shin)

      // Suneate: five separate iron splints, mail showing between them
      ;[-2, -1, 0, 1, 2].forEach((k) => {
        const splint = plate(0.168, 0.176, 0.32, arc(FRONT + k * 0.44, 0.32), mats.metal, 0.02)
        splint.position.y = -0.29
        knee.add(splint)
      })

      const shinTrim = plate(0.174, 0.176, 0.028, arc(FRONT, Math.PI * 0.9), mats.gold, 0.014)
      shinTrim.position.y = -0.12
      knee.add(shinTrim)
      const shinCuff = plate(0.158, 0.16, 0.024, arc(FRONT, Math.PI * 0.9), mats.leather, 0.014)
      shinCuff.position.y = -0.455
      knee.add(shinCuff)

      // Cords binding the splints on, knotted at the back of the calf
      ;[-0.16, -0.41].forEach((yy) => {
        const tie = mesh(new THREE.TorusGeometry(0.168, 0.008, 6, 48), mats.rope)
        tie.position.set(0, yy, 0.0135)
        tie.rotation.x = Math.PI / 2
        knee.add(tie)
        const knot = mesh(new THREE.SphereGeometry(0.02, 10, 8), mats.rope)
        knot.position.set(side * 0.07, yy, -0.14)
        knot.scale.set(1.3, 0.8, 1)
        knee.add(knot)
      })

      const ankle = new THREE.Group()
      ankle.position.y = -0.5
      knee.add(ankle)

      // Kegutsu: a leather boot with a rounded toe over a flat vamp, a rolled
      // cuff, two instep straps and a plaited straw sole.
      const foot = mesh(new THREE.SphereGeometry(0.2, 36, 22), mats.leather)
      foot.position.set(0, -0.01, 0.1)
      foot.scale.set(0.95, 0.5, 1.45)
      ankle.add(foot)

      const vamp = mesh(new RoundedBoxGeometry(0.3, 0.1, 0.46, 4, 0.045), mats.leather)
      vamp.position.set(0, -0.06, 0.1)
      ankle.add(vamp)

      const cuff = mesh(new THREE.TorusGeometry(0.15, 0.032, 14, 48), mats.leather)
      cuff.position.y = 0.04
      cuff.rotation.x = Math.PI / 2
      ankle.add(cuff)

      const sole = mesh(new RoundedBoxGeometry(0.32, 0.04, 0.48, 4, 0.018), mats.straw)
      sole.position.set(0, -0.1, 0.1)
      ankle.add(sole)

      ;[
        [0.15, 0.07, 0.3],
        [0.27, 0.035, 0.55],
      ].forEach(([z, yy, tilt]) => {
        const strap = mesh(new RoundedBoxGeometry(0.34, 0.045, 0.055, 3, 0.02), mats.leather)
        strap.position.set(0, yy, z)
        strap.rotation.x = tilt
        ankle.add(strap)
        // A small brass buckle on the outside of each strap
        const buckle = mesh(new THREE.TorusGeometry(0.02, 0.0045, 6, 4), mats.gold)
        buckle.position.set(side * 0.15, yy + 0.012, z)
        buckle.rotation.set(tilt - Math.PI / 2, 0, Math.PI / 4)
        ankle.add(buckle)
      })

      // Welt stitching round the boot, just above the sole
      const stitch = new THREE.BoxGeometry(0.006, 0.006, 0.017)
      const stitches = Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2
        return new THREE.Matrix4().compose(
          new THREE.Vector3(Math.sin(a) * 0.158, -0.075, 0.1 + Math.cos(a) * 0.238),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
          new THREE.Vector3(1, 1, 1)
        )
      })
      ankle.add(mesh(mergeCopies(stitch, stitches), mats.rope))
      stitch.dispose()

      return { hip, knee, ankle, side }
    })

    /* ================================================================
       Body — fabric torso, a laced dō, separated kusazuri
       ================================================================ */
    const body = new THREE.Group()
    body.position.y = HIP_Y
    samurai.add(body)

    // The undergarment. Every armour piece sits on top of this with a gap.
    const torso = mesh(new RoundedBoxGeometry(0.72, 0.84, 0.56, 8, 0.22), mats.fabric)
    torso.position.y = 0.46
    body.add(torso)

    const neck = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 40), mats.fabric)
    neck.position.y = 0.93
    body.add(neck)

    // Dō: a solid chest plate on each side, with laced lames hanging below.
    // Front and back are separate; small flank plates close most of the gap.
    const cuirass = new THREE.Group()
    cuirass.position.y = 0.52
    cuirass.scale.z = 0.74
    body.add(cuirass)

    ;[
      [FRONT, Math.PI * 0.88, 5],
      [BACK, Math.PI * 0.72, 4],
    ].forEach(([center, sweep, cords]) => {
      const chest = plate(0.42, 0.435, 0.2, arc(center, sweep), mats.red, 0.03)
      chest.position.y = 0.16
      cuirass.add(chest)

      const rim = plate(0.43, 0.43, 0.022, arc(center, sweep), mats.gold, 0.04)
      rim.position.y = 0.265
      cuirass.add(rim)

      lamellar(cuirass, {
        rows: 4,
        rowH: 0.068,
        gap: 0.02,
        rTop: 0.44,
        flare: 0.07,
        span: arc(center, sweep + 0.06),
        y: 0.038,
        material: [mats.red, mats.red, mats.redDark, mats.red],
        hang: 0.05,
        cordsPer: cords,
      })
    })

    // Waki-ita: iron plates under the arms, tucked beneath the chest halves
    ;[LEFT, RIGHT].forEach((c) => {
      const flank = plate(0.408, 0.42, 0.17, arc(c, 0.62), mats.metal, 0.024)
      flank.position.y = 0.17
      cuirass.add(flank)
    })

    ;[-0.3, -0.13, 0.13, 0.3].forEach((x) => {
      stud(cuirass, x, 0.21, Math.sqrt(0.432 ** 2 - x * x) + 0.004, Math.asin(x / 0.432))
    })

    // A row of small iron rivets under the gilt rim of each chest plate
    const rimRivet = new THREE.SphereGeometry(0.009, 8, 6)
    const rimRivets = []
    ;[
      [FRONT, Math.PI * 0.88],
      [BACK, Math.PI * 0.72],
    ].forEach(([center, sweep]) => {
      for (let i = 0; i < 9; i++) {
        const a = center - sweep / 2 + (sweep * (i + 0.5)) / 9
        rimRivets.push(new THREE.Matrix4().makeTranslation(Math.sin(a) * 0.437, 0.244, Math.cos(a) * 0.437))
      }
    })
    ;[LEFT, RIGHT].forEach((c) => {
      for (const dy of [0.12, 0.22]) {
        rimRivets.push(new THREE.Matrix4().makeTranslation(Math.sin(c) * 0.423, dy, Math.cos(c) * 0.423))
      }
    })
    cuirass.add(mesh(mergeCopies(rimRivet, rimRivets), mats.metalDark))
    rimRivet.dispose()

    // Chest device: a simple geometric mark on a gold disc
    const monPlate = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 48), mats.gold)
    monPlate.position.set(0, 0.16, 0.445)
    monPlate.rotation.x = Math.PI / 2
    cuirass.add(monPlate)

    const monRing = mesh(new THREE.TorusGeometry(0.066, 0.014, 12, 48), mats.metalDark)
    monRing.position.set(0, 0.16, 0.462)
    cuirass.add(monRing)

    // Sendan-no-ita and kyubi-no-ita: the two small laced plates that hang
    // from the shoulder straps over the top of the chest.
    ;[-1, 1].forEach((side) => {
      lamellar(cuirass, {
        rows: 2,
        rowH: 0.06,
        gap: 0.014,
        rTop: 0.464,
        flare: 0.03,
        span: arc(side * 0.6, 0.28),
        y: 0.33,
        material: [mats.red, mats.redDark],
        trim: mats.gold,
        hang: 0.03,
        cordsPer: 1,
        thickness: 0.018,
        cross: false,
      })
    })

    // Watagami: stitched leather shoulder straps tying the dō on, each
    // fastened with a brass buckle
    ;[-1, 1].forEach((side) => {
      const strapRig = new THREE.Group()
      strapRig.position.set(side * 0.24, 0.82, 0.19)
      strapRig.rotation.z = side * 0.25
      body.add(strapRig)
      strapRig.add(mesh(new RoundedBoxGeometry(0.075, 0.34, 0.026, 3, 0.01), mats.leather))

      const stitch = new THREE.BoxGeometry(0.005, 0.014, 0.006)
      const rows = []
      for (let i = 0; i < 12; i++) {
        for (const x of [-0.029, 0.029]) rows.push(new THREE.Matrix4().makeTranslation(x, -0.15 + i * 0.027, 0.013))
      }
      strapRig.add(mesh(mergeCopies(stitch, rows), mats.rope))
      stitch.dispose()

      const buckle = mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 4), mats.gold)
      buckle.rotation.z = Math.PI / 4
      buckle.scale.set(1.3, 1, 1)
      buckle.position.set(0, -0.05, 0.017)
      strapRig.add(buckle)
      const tongue = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), mats.gold)
      tongue.position.set(0, -0.05, 0.021)
      strapRig.add(tongue)
    })

    // Agemaki: the large decorative silk bow on the back of the dō
    const agemaki = new THREE.Group()
    agemaki.position.set(0, 0.66, -0.36)
    body.add(agemaki)
    const loopGeo = track(new THREE.TorusGeometry(0.075, 0.021, 14, 48))
    ;[-1, 1].forEach((s) => {
      const loop = new THREE.Mesh(loopGeo, mats.cloth)
      loop.castShadow = loop.receiveShadow = true
      loop.position.set(s * 0.078, 0.03, 0)
      loop.rotation.set(0.25, 0, s * 0.6)
      agemaki.add(loop)

      const tail = mesh(new RoundedBoxGeometry(0.042, 0.32, 0.018, 3, 0.012), mats.cloth)
      tail.position.set(s * 0.045, -0.18, 0.004)
      tail.rotation.z = s * 0.1
      agemaki.add(tail)
    })
    const agemakiKnot = mesh(new THREE.SphereGeometry(0.048, 24, 16), mats.cloth)
    agemakiKnot.scale.set(1.3, 0.9, 0.8)
    agemaki.add(agemakiKnot)

    // Obi sash, tied in a knot on the left hip
    const sash = mesh(
      foldCloth(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 64, 8), 0.15, {
        rings: [
          [0.3, 0.025, 0.08],
          [0.72, 0.02, 0.06],
        ],
        creases: 0.015,
        seed: 2,
      }),
      mats.cloth
    )
    sash.position.y = 0.1
    sash.scale.z = 0.74
    body.add(sash)

    const sashKnot = new THREE.Group()
    sashKnot.position.set(-0.31, 0.09, 0.23)
    sashKnot.rotation.y = -0.8
    body.add(sashKnot)
    const knotCore = mesh(new THREE.SphereGeometry(0.06, 24, 16), mats.cloth)
    knotCore.scale.set(1.3, 0.85, 0.9)
    sashKnot.add(knotCore)
    ;[-1, 1].forEach((s) => {
      const loop = new THREE.Mesh(track(new THREE.TorusGeometry(0.06, 0.024, 12, 40)), mats.cloth)
      loop.castShadow = loop.receiveShadow = true
      loop.position.set(s * 0.07, 0.02, 0)
      loop.rotation.set(0.35, 0, s * 0.7)
      sashKnot.add(loop)
    })
    ;[0.03, -0.045].forEach((x, i) => {
      const tail = mesh(new RoundedBoxGeometry(0.08, 0.3, 0.03, 4, 0.014), mats.cloth)
      tail.position.set(x, -0.19 - i * 0.03, 0.02 - i * 0.03)
      tail.rotation.z = 0.12 - i * 0.3
      sashKnot.add(tail)
    })

    // Saya: the empty scabbard, lacquered wood, thrust through the obi on
    // the left hip and angled back. It has a horn mouth (koiguchi), a knob
    // (kurikata) for the silk cord (sageo) looped over the obi, and an iron
    // end cap (kojiri). Kneeling, it swings up to clear the floor.
    const saya = new THREE.Group()
    saya.position.set(-0.42, 0.16, 0.2)
    body.add(saya)
    const SAYA_LEN = 1.18
    const DOWN = new THREE.Vector3(0, -1, 0)
    const sayaStand = new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(-0.22, -0.42, -0.88).normalize())
    const sayaSeated = new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(-0.2, -0.12, -0.97).normalize())
    saya.quaternion.copy(sayaStand)
    const sayaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.012, -SAYA_LEN * 0.5, 0),
      new THREE.Vector3(0.045, -SAYA_LEN, 0),
    ])
    const sheath = new THREE.TubeGeometry(sayaCurve, 40, 0.036, 14, false)
    sheath.scale(0.62, 1, 1)
    saya.add(mesh(sheath, mats.saya))
    const koiguchi = mesh(new THREE.CylinderGeometry(0.038, 0.037, 0.04, 18), mats.metalDark)
    koiguchi.scale.set(0.62, 1, 1)
    koiguchi.position.y = -0.012
    saya.add(koiguchi)
    const kurikata = mesh(new RoundedBoxGeometry(0.018, 0.05, 0.03, 2, 0.007), mats.saya)
    kurikata.position.set(0.001, -0.15, 0.036)
    saya.add(kurikata)
    const kojiri = mesh(new THREE.SphereGeometry(0.036, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.metalDark)
    kojiri.position.copy(sayaCurve.getPointAt(1))
    kojiri.scale.set(0.62, 1.4, 1)
    saya.add(kojiri)
    // The cord, authored in body space and carried into the saya's frame.
    saya.updateMatrix()
    const toSaya = saya.matrix.clone().invert()
    const knob = kurikata.position.clone().applyMatrix4(saya.matrix)
    const sageoCurve = new THREE.CatmullRomCurve3(
      [
        knob,
        knob.clone().add(new THREE.Vector3(0.05, -0.12, 0.05)),
        new THREE.Vector3(-0.3, -0.02, 0.26),
        new THREE.Vector3(-0.2, 0.06, 0.29),
        new THREE.Vector3(-0.12, 0.14, 0.29),
      ].map((p) => p.applyMatrix4(toSaya))
    )
    saya.add(mesh(new THREE.TubeGeometry(sageoCurve, 36, 0.009, 6), mats.rope))

    // Kusazuri: six separate laced panels hanging off the sash. Each hangs
    // from a hinge along its top edge, so it can fan out over the floor and
    // thighs when he sits.
    const skirt = new THREE.Group()
    skirt.position.y = -0.04
    skirt.scale.z = 0.76
    body.add(skirt)

    const SKIRT_R = 0.44
    const panels = []
    for (let i = 0; i < 6; i++) {
      const center = (i / 6) * Math.PI * 2
      const hinge = new THREE.Group()
      hinge.position.set(Math.sin(center) * SKIRT_R, 0.01, Math.cos(center) * SKIRT_R)
      hinge.rotation.y = center
      skirt.add(hinge)

      const flap = new THREE.Group()
      hinge.add(flap)

      // Undo the hinge transform, so the panel is authored in skirt space.
      const unhinge = new THREE.Group()
      unhinge.position.set(0, -0.01, -SKIRT_R)
      unhinge.rotation.y = -center
      flap.add(unhinge)

      lamellar(unhinge, {
        rows: 4,
        rowH: 0.078,
        gap: 0.02,
        rTop: SKIRT_R,
        flare: 0.24,
        span: arc(center, Math.PI * 0.25),
        y: 0.01,
        material: [mats.red, mats.red, mats.redDark, mats.red],
        trim: mats.gold,
        hang: 0.07,
        cordsPer: 2,
      })
      // Kneeling: the front panel lies over the thighs, the side panels drape
      // down their outsides, and the rear ones hang almost straight behind.
      const facing = Math.cos(center)
      panels.push({ flap, spread: facing > 0.9 ? 1.35 : facing > 0 ? 0.95 : facing > -0.9 ? 0.45 : 0.35 })
    }

    /* ================================================================
       Shoulders and arms — laced sode over fabric sleeves, mail forearms
       ================================================================ */
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.46, 0.72, 0)
      body.add(shoulder)

      const cord = mesh(new THREE.TorusGeometry(0.09, 0.02, 12, 48), mats.rope)
      cord.position.set(side * 0.02, 0.1, 0)
      cord.rotation.x = Math.PI / 2
      shoulder.add(cord)

      const capKnot = mesh(new THREE.SphereGeometry(0.045, 24, 16), mats.rope)
      capKnot.position.set(side * 0.02, 0.12, 0)
      shoulder.add(capKnot)

      // Sode: five lames draped over the outside of the shoulder
      const outward = side > 0 ? RIGHT : LEFT
      const sode = lamellar(shoulder, {
        rows: 5,
        rowH: 0.07,
        gap: 0.02,
        rTop: 0.24,
        flare: 0.16,
        span: arc(outward, Math.PI * 0.86),
        y: 0.065,
        material: [mats.red, mats.red, mats.redDark, mats.red, mats.red],
        trim: mats.gold,
        topTrim: mats.gold,
        hang: 0.04,
        cordsPer: 3,
      })
      sode.rotation.z = side * -0.12
      // Rivets fixing the top plate (kanmuri-ita) of the sode
      ;[-0.55, 0, 0.55].forEach((o) => {
        const rv = mesh(new THREE.SphereGeometry(0.009, 8, 6), mats.metalDark)
        rv.position.set(Math.sin(outward + o) * 0.253, -0.009, Math.cos(outward + o) * 0.253)
        sode.add(rv)
      })

      const upper = mesh(
        foldCloth(new THREE.CylinderGeometry(0.12, 0.11, 0.34, 40, 12), 0.34, {
          rings: [
            [0.08, 0.06, 0.08],
            [0.24, 0.025, 0.07],
          ],
          creases: 0.03,
          seed: side * 2 + 5,
        }),
        mats.fabric
      )
      upper.position.y = -0.36
      shoulder.add(upper)

      const elbow = new THREE.Group()
      elbow.position.y = -0.56
      shoulder.add(elbow)

      // Kote: mail sleeve with three lacquered splints on the outside
      const fore = mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.36, 40), mats.kusari)
      fore.position.y = -0.18
      elbow.add(fore)

      ;[-1, 0, 1].forEach((k) => {
        const splint = plate(0.126, 0.13, 0.24, arc(outward + k * 0.42, 0.3), mats.red, 0.02)
        splint.position.y = -0.18
        elbow.add(splint)
      })

      const koteTrim = plate(0.122, 0.124, 0.024, arc(outward, Math.PI * 0.86), mats.gold, 0.014)
      koteTrim.position.y = -0.05
      elbow.add(koteTrim)

      const koteCuff = plate(0.126, 0.128, 0.024, arc(outward, Math.PI * 0.86), mats.leather, 0.014)
      koteCuff.position.y = -0.325
      elbow.add(koteCuff)

      // Ties holding the kote on, knotted on the inside of the forearm
      // through a small brass ring
      ;[-0.1, -0.27].forEach((yy, i) => {
        const tie = mesh(new THREE.TorusGeometry(0.106, 0.007, 6, 40), mats.rope)
        tie.position.y = yy
        tie.rotation.x = Math.PI / 2
        elbow.add(tie)
        const knot = mesh(new THREE.SphereGeometry(0.015, 10, 8), mats.rope)
        knot.position.set(-Math.sin(outward) * 0.108, yy, 0.02)
        elbow.add(knot)
        if (i === 0) {
          const ring = mesh(new THREE.TorusGeometry(0.013, 0.0035, 6, 16), mats.gold)
          ring.position.set(-Math.sin(outward) * 0.112, yy - 0.02, 0.03)
          ring.rotation.y = outward
          elbow.add(ring)
        }
      })

      stud(elbow, Math.sin(outward) * 0.138, -0.18, 0, outward, 0.8)

      // Tekko: an iron plate over the back of the gloved hand
      const hand = mesh(new THREE.SphereGeometry(0.12, 32, 24), mats.leather)
      hand.position.y = -0.4
      hand.scale.set(1, 1.15, 0.92)
      elbow.add(hand)

      const tekko = plate(0.13, 0.12, 0.12, arc(outward, Math.PI * 0.7), mats.metal, 0.018)
      tekko.position.y = -0.38
      elbow.add(tekko)

      return { shoulder, elbow, side, sode }
    })

    /* ================================================================
       Head — a black lacquered menpō with lit eye slits
       ================================================================ */
    const headRig = new THREE.Group()
    headRig.position.y = HEAD_Y - HIP_Y
    headRig.rotation.order = 'YXZ'
    body.add(headRig)

    // The cranium is an ellipsoid; the mask plates below are built in a
    // group with the same depth scale, so curved plates sit on its surface.
    const FACE_R = 0.46
    const FACE_SY = 0.92
    const FACE_SZ = 0.94
    const faceRing = (y) => Math.sqrt(Math.max(FACE_R * FACE_R - (y / FACE_SY) ** 2, 0.02))

    const face = mesh(new THREE.SphereGeometry(FACE_R, 48, 32), mats.helmetRound)
    face.scale.set(1, FACE_SY, FACE_SZ)
    headRig.add(face)

    const mask = new THREE.Group()
    mask.scale.z = FACE_SZ
    headRig.add(mask)

    // Brow: a heavy ridge following the curve of the skull
    const brow = plate(
      faceRing(0.305) + 0.014,
      faceRing(0.215) + 0.014,
      0.09,
      arc(FRONT, Math.PI * 0.9),
      mats.helmet,
      0.03
    )
    brow.position.y = 0.26
    mask.add(brow)

    // Eye band: a dark plate the slits are cut into
    const eyeBand = plate(
      faceRing(0.21) + 0.01,
      faceRing(0.02) + 0.01,
      0.19,
      arc(FRONT, Math.PI * 0.84),
      mats.helmet,
      0.028
    )
    eyeBand.position.y = 0.115
    mask.add(eyeBand)

    // Long, nearly level slits: focused rather than angry. Each is a
    // flattened capsule set into the band, with a soft additive halo.
    const eyeGeo = track(new THREE.CapsuleGeometry(0.03, 0.19, 8, 24))
    eyeGeo.rotateZ(Math.PI / 2)
    eyeGeo.scale(1, 1, 0.45)
    const glowGeo = track(new THREE.PlaneGeometry(0.42, 0.24))
    const EYE_R = faceRing(0.11) + 0.024
    const eyes = []
    const glows = []
    ;[-1, 1].forEach((side) => {
      const a = side * 0.4
      const eye = new THREE.Mesh(eyeGeo, mats.eye)
      eye.position.set(Math.sin(a) * EYE_R, 0.11, Math.cos(a) * EYE_R)
      eye.rotation.set(0, a, side * 0.06)
      mask.add(eye)
      eyes.push(eye)

      const glow = new THREE.Mesh(glowGeo, glowMat)
      glow.position.set(Math.sin(a) * (EYE_R + 0.025), 0.11, Math.cos(a) * (EYE_R + 0.025))
      glow.rotation.set(0, a, side * 0.06)
      mask.add(glow)
      glows.push(glow)
    })

    // Cheek plates
    ;[-1, 1].forEach((side) => {
      const a = side * 1.0
      const cheek = plate(
        faceRing(0.06) + 0.012,
        faceRing(-0.24) + 0.012,
        0.3,
        arc(a, 0.55),
        mats.helmet,
        0.024
      )
      cheek.position.y = -0.09
      mask.add(cheek)
    })

    // Nose ridge
    const nose = mesh(new THREE.ConeGeometry(0.075, 0.2, 24), mats.helmetRound)
    nose.position.set(0, -0.02, 0.42)
    nose.rotation.x = -0.42
    nose.scale.x = 0.85
    mask.add(nose)

    // Mouth guard: tapers in toward the chin, with three breathing slots
    const GUARD_TOP = faceRing(-0.05) + 0.012
    const GUARD_BOT = faceRing(-0.35) + 0.012
    const guard = plate(GUARD_TOP, GUARD_BOT, 0.3, arc(FRONT, Math.PI * 0.72), mats.helmet, 0.03)
    guard.position.y = -0.2
    mask.add(guard)

    ;[-0.115, -0.165, -0.215].forEach((yy) => {
      const t = (-0.05 - yy) / 0.3
      const r = GUARD_TOP + (GUARD_BOT - GUARD_TOP) * t + 0.016
      const vent = plate(r - 0.004, r + 0.004, 0.02, arc(FRONT, 0.62), mats.helmet, 0.012, 12)
      vent.position.y = yy
      mask.add(vent)
    })

    // Gold sunbursts lacquered onto the cheeks, either side of the nose.
    // They lie over the eye band and the mouth guard, which stand proud of
    // the skull there, so the whole burst shows.
    const burst = track(sunburstGeometry())
    ;[-1, 1].forEach((side) => {
      const a = side * 0.53
      const yy = -0.022
      const r = Math.max(faceRing(0.02) + 0.02, GUARD_TOP + 0.012)
      const sun = new THREE.Mesh(burst, mats.gold)
      sun.castShadow = sun.receiveShadow = true
      sun.position.set(Math.sin(a) * r, yy, Math.cos(a) * r)
      sun.rotation.order = 'YXZ'
      sun.rotation.set(0.02, a, side * 0.35)
      sun.scale.setScalar(1.15)
      mask.add(sun)
    })

    // Chin
    const chin = mesh(new THREE.SphereGeometry(0.065, 32, 20), mats.helmetRound)
    chin.position.set(0, -0.355, 0.235)
    chin.scale.set(1.3, 0.75, 0.8)
    mask.add(chin)

    // Yodare-kake: two laced lames guarding the throat beneath the mask
    lamellar(mask, {
      rows: 2,
      rowH: 0.06,
      gap: 0.014,
      rTop: 0.285,
      flare: 0.6,
      span: arc(FRONT, Math.PI * 0.9),
      y: -0.37,
      material: mats.helmetLame,
      lacing: mats.helmetLacing,
      cordsPer: 4,
      thickness: 0.02,
    })

    // A cloth collar draped round the neck, flattened so it hangs rather
    // than inflates.
    const scarf = mesh(new THREE.TorusGeometry(0.34, 0.075, 14, 56), mats.cloth)
    scarf.position.y = -0.5
    scarf.rotation.x = Math.PI / 2
    scarf.scale.set(1, 1, 0.6)
    headRig.add(scarf)

    const tails = [0.1, -0.06].map((x, i) => {
      const tail = mesh(new RoundedBoxGeometry(0.13, 0.36, 0.06, 4, 0.03), mats.cloth)
      tail.position.set(x, -0.76 - i * 0.05, 0.27 - i * 0.05)
      tail.rotation.z = 0.2 - i * 0.35
      headRig.add(tail)
      return tail
    })

    /* ================================================================
       Kabuto — black lacquer flecked with gold, a broad engraved crest
       ================================================================ */
    const helmet = new THREE.Group()
    helmet.position.y = 0.14
    headRig.add(helmet)

    const bowlRig = new THREE.Group()
    bowlRig.position.y = 0.16
    bowlRig.scale.y = 1.12
    helmet.add(bowlRig)

    const bowl = mesh(
      new THREE.SphereGeometry(0.6, 72, 36, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.helmetRound
    )
    bowlRig.add(bowl)

    // A few low seams where the bowl's plates meet, one running up the front
    const seamCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 9 }, (_, i) => {
        const phi = 0.12 + (i / 8) * (Math.PI / 2 - 0.14)
        return new THREE.Vector3(Math.sin(phi) * 0.598, Math.cos(phi) * 0.598, 0)
      })
    )
    const seam = taperTube(new THREE.TubeGeometry(seamCurve, 24, 0.009, 6), seamCurve, 24, 6, (t) =>
      0.6 + t * 0.4
    )
    const SEAMS = 8
    bowlRig.add(
      mesh(
        mergeCopies(
          seam,
          Array.from({ length: SEAMS }, (_, i) => new THREE.Matrix4().makeRotationY((i / SEAMS) * Math.PI * 2))
        ),
        mats.helmetRound
      )
    )
    seam.dispose()

    // Koshimaki: a raised band round the base of the bowl
    const band = plate(0.615, 0.615, 0.06, [0, Math.PI * 2], mats.helmet, 0.03, 96)
    band.position.y = 0.19
    helmet.add(band)

    // Mabisashi: the peak, sweeping forward and down, with a rolled lip
    const visor = plate(0.6, 0.76, 0.1, arc(FRONT, Math.PI * 0.82), mats.helmet, 0.022, 36)
    visor.position.y = 0.23
    helmet.add(visor)
    const visorLip = plate(0.76, 0.772, 0.022, arc(FRONT, Math.PI * 0.82), mats.helmet, 0.03, 36)
    visorLip.position.y = 0.183
    helmet.add(visorLip)

    // Shikoro: black lames guarding the back of the neck, closely laced
    const shikoro = lamellar(helmet, {
      rows: 4,
      rowH: 0.08,
      gap: 0.026,
      rTop: 0.625,
      flare: 0.34,
      span: arc(BACK, Math.PI * 1.44),
      y: 0.13,
      material: mats.helmetLame,
      lacing: mats.helmetLacing,
      cordsPer: 12,
    })
    shikoro.position.z = -0.08
    shikoro.rotation.x = 0.22

    // Fukigaeshi: the lames turned back beside the face into broad wings
    ;[-1, 1].forEach((side) => {
      const span = arc(side > 0 ? RIGHT : LEFT, Math.PI * 0.72)
      const wingRig = new THREE.Group()
      wingRig.position.set(side * 0.6, 0.06, 0.18)
      wingRig.rotation.set(0.08, 0, side * 0.42)
      helmet.add(wingRig)
      wingRig.add(plate(0.17, 0.27, 0.36, span, mats.helmet, 0.026))
      const lip = plate(0.27, 0.272, 0.024, span, mats.helmet, 0.034)
      lip.position.y = -0.168
      wingRig.add(lip)
    })

    // Maedate: a broad gilt crest, two swept blades rising from a
    // chrysanthemum boss, engraved all over with scrolling clouds. It stands
    // on the front of the bowl just above the peak, leaning back a little.
    const crest = new THREE.Group()
    crest.position.set(0, 0.37, 0.6)
    crest.rotation.x = -0.28
    helmet.add(crest)
    crest.add(mesh(crestGeometry(), mats.crest))

    // Kiku boss: sixteen petals round a domed centre
    const boss = new THREE.Group()
    boss.position.z = 0.02
    crest.add(boss)
    const bossDisc = mesh(new THREE.CylinderGeometry(0.086, 0.092, 0.028, 40), mats.gold)
    bossDisc.rotation.x = Math.PI / 2
    boss.add(bossDisc)
    const petal = new THREE.SphereGeometry(1, 10, 6)
    boss.add(
      mesh(
        mergeCopies(
          petal,
          Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            return new THREE.Matrix4().compose(
              new THREE.Vector3(Math.sin(a) * 0.058, Math.cos(a) * 0.058, 0.016),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a),
              new THREE.Vector3(0.013, 0.03, 0.009)
            )
          })
        ),
        mats.gold
      )
    )
    petal.dispose()
    const bossDome = mesh(new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.gold)
    bossDome.rotation.x = Math.PI / 2
    bossDome.position.z = 0.016
    boss.add(bossDome)

    /* ================================================================
       Katana — held low in the right hand
       ================================================================ */
    const katana = new THREE.Group()
    arms[1].elbow.add(katana)
    katana.position.set(0.02, -0.4, 0.04)

    // Tsuka: white ray skin under a crossed black silk wrap
    const core = mesh(new RoundedBoxGeometry(0.086, 0.5, 0.072, 4, 0.03), mats.bowl)
    core.position.y = -0.12
    katana.add(core)

    const wrap = new RoundedBoxGeometry(0.108, 0.022, 0.02, 3, 0.009)
    const wrapMatrices = []
    for (let i = 0; i < 8; i++) {
      for (const z of [0.038, -0.038]) {
        for (const tilt of [0.6, -0.6]) {
          wrapMatrices.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(0, 0.1 - i * 0.056, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)),
              new THREE.Vector3(1, 1, 1)
            )
          )
        }
      }
    }
    katana.add(mesh(mergeCopies(wrap, wrapMatrices), mats.fabric))
    wrap.dispose()

    const menuki = mesh(new THREE.OctahedronGeometry(0.035, 2), mats.gold)
    menuki.position.set(0, -0.13, 0.046)
    menuki.scale.set(1, 1.4, 0.4)
    katana.add(menuki)

    const kashira = mesh(new RoundedBoxGeometry(0.1, 0.06, 0.086, 4, 0.025), mats.metalDark)
    kashira.position.y = -0.39
    katana.add(kashira)

    const fuchi = mesh(new RoundedBoxGeometry(0.098, 0.04, 0.084, 4, 0.015), mats.gold)
    fuchi.position.y = 0.13
    katana.add(fuchi)

    const tsuba = mesh(tsubaGeometry(0.17, 0.024), mats.metalDark)
    tsuba.position.y = 0.165
    katana.add(tsuba)

    const tsubaRim = mesh(new THREE.TorusGeometry(0.17, 0.012, 12, 64), mats.gold)
    tsubaRim.position.y = 0.165
    tsubaRim.rotation.x = Math.PI / 2
    katana.add(tsubaRim)

    // Seppa: thin washers either side of the guard; mekugi: the bamboo peg
    // pinning the blade's tang into the handle
    ;[0.146, 0.184].forEach((yy) => {
      const seppa = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 24), mats.gold)
      seppa.position.y = yy
      seppa.scale.z = 0.8
      katana.add(seppa)
    })
    const mekugi = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 8), mats.rope)
    mekugi.rotation.x = Math.PI / 2
    mekugi.position.y = 0.06
    katana.add(mekugi)

    const habaki = mesh(new RoundedBoxGeometry(0.09, 0.07, 0.04, 4, 0.015), mats.gold)
    habaki.position.y = 0.215
    katana.add(habaki)

    const blade = mesh(bladeGeometry(1.26), mats.steel)
    blade.position.y = 0.19
    katana.add(blade)

    /* ---- Bake every rigid part down to a few meshes ---- */
    bake(helmet)
    bake(mask, [...eyes, ...glows])
    bake(cuirass)
    panels.forEach(({ flap }) => bake(flap))
    bake(saya)
    bake(body, [torso, cuirass, skirt, headRig, saya, ...arms.map((a) => a.shoulder)])
    bake(katana)
    arms.forEach(({ shoulder, elbow, sode }) => {
      bake(sode)
      bake(elbow, [katana])
      bake(shoulder, [elbow, sode])
    })
    legs.forEach(({ hip, knee, ankle }) => {
      bake(ankle)
      bake(knee, [ankle])
      bake(hip, [knee])
    })
    // Meshes that stay live (eyes, cranium) still need a colour attribute,
    // since their materials read one.
    samurai.traverse((o) => {
      if (!o.isMesh || !o.material.vertexColors || o.geometry.attributes.color) return
      const n = o.geometry.attributes.position.count
      o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3))
    })

    /* ================================================================
       Ground — shadow map plus a painted contact pool
       ================================================================ */
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 })
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(22, 22)), shadowMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const poolCanvas = document.createElement('canvas')
    poolCanvas.width = poolCanvas.height = 256
    const pctx = poolCanvas.getContext('2d')
    const grad = pctx.createRadialGradient(128, 128, 4, 128, 128, 124)
    grad.addColorStop(0, 'rgba(0,0,0,0.5)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.2)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    pctx.fillStyle = grad
    pctx.fillRect(0, 0, 256, 256)

    const poolTex = new THREE.CanvasTexture(poolCanvas)
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      depthWrite: false,
    })
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, 3.2)), poolMat)
    pool.rotation.x = -Math.PI / 2
    pool.position.y = 0.012
    scene.add(pool)

    /* ================================================================
       Behaviour — meditation, moods, actions, idle life, the cursor
       ================================================================ */
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let calmMotion = motionQuery.matches
    // Big enough to float him in the corner without covering the content.
    const dockQuery = window.matchMedia('(min-width: 1280px) and (hover: hover) and (pointer: fine)')

    // Loop state comes first: wake() can be called while the rest is set up.
    let frame = null
    let started = false
    let last = 0
    let gate = null

    // `w` runs 0 (standing) → 1 (seated in meditation).
    const pose = { w: 0, from: 0, to: 0, start: -TRANSITION, next: FIRST_SIT_AT }
    let now = 0

    const toggleMeditation = () => {
      pose.from = pose.w
      pose.to = pose.to ? 0 : 1
      pose.start = now
      pose.next = now + TRANSITION + (pose.to ? MEDITATE_FOR : STAND_FOR)
      wake()
    }
    const standUp = () => {
      if (pose.to === 1) toggleMeditation()
    }

    // Standing, the blade follows the mood; seated, it lies across the lap
    // (blade toward his left, edge up), held in body space.
    const katanaLap = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.12, Math.PI / 2))

    /* ---- Mood: springs carry the current pose toward the mood's pose ---- */
    let mood = 'calm'
    let target = MOOD_TARGETS.calm
    const cur = makePose()
    const vel = {
      s: Object.fromEntries(SCALARS.map((k) => [k, 0])),
      R: new THREE.Vector3(),
      L: new THREE.Vector3(),
    }
    // What the mood and any action produce this frame, before idle motion.
    const out = makePose()
    const actionFrom = makePose()
    let action = null

    const settle = () => {
      copyPose(cur, target)
      for (const k of SCALARS) vel.s[k] = 0
      vel.R.set(0, 0, 0)
      vel.L.set(0, 0, 0)
    }

    const springVec = (v, velocity, goal, omega, dt) => {
      for (const axis of ['x', 'y', 'z']) {
        const r = spring(v[axis], velocity[axis], goal[axis], omega, dt)
        v[axis] = r.x
        velocity[axis] = r.v
      }
    }

    const followMood = (dt) => {
      if (calmMotion) return settle()
      for (const k of SCALARS) {
        const r = spring(cur.s[k], vel.s[k], target.s[k], 5.5, dt)
        cur.s[k] = r.x
        vel.s[k] = r.v
      }
      springVec(cur.R, vel.R, target.R, 6, dt)
      springVec(cur.L, vel.L, target.L, 6, dt)
      cur.q.slerp(target.q, 1 - Math.exp(-5 * dt))
    }

    const startAction = (name) => {
      const def = ACTIONS[name]
      if (!def || calmMotion || !started) return
      standUp()
      // Start from wherever he is now, even mid-way through another action.
      copyPose(actionFrom, out)
      action = { def, start: now }
      micro.glance = micro.shift = null
      wake()
    }

    const onMood = (next) => {
      if (!MOOD_TARGETS[next] || next === mood) return
      const was = mood
      mood = next
      target = MOOD_TARGETS[next]
      if (next !== 'calm') standUp()
      else if (was !== 'calm') pose.next = Math.max(pose.next, now + FIRST_SIT_AT)
      if (calmMotion) settle()
      else if (next === 'victory' && !action) startAction('hop')
      wake()
    }

    /** Keyframes between the pose he started from and the pose his mood wants. */
    const evalAction = () => {
      const { def, start } = action
      const u = (now - start) / def.duration
      if (u >= 1) {
        action = null
        copyPose(out, cur)
        return
      }
      let a = actionFrom
      let ta = 0
      let b = cur
      let tb = 1
      for (const key of def.keys) {
        if (key.t <= u) {
          a = key
          ta = key.t
        } else {
          b = key
          tb = key.t
          break
        }
      }
      const k = smootherstep(clamp((u - ta) / (tb - ta), 0, 1))
      // A key only sets what it names; anything else follows the mood.
      const val = (p, ch) => (p.partial && !(ch in p.s) ? cur.s[ch] : p.s[ch])
      const pick = (p, name) => (p.partial ? p[name] || cur[name] : p[name])
      for (const ch of SCALARS) out.s[ch] = lerp(val(a, ch), val(b, ch), k)
      out.R.lerpVectors(pick(a, 'R'), pick(b, 'R'), k)
      out.L.lerpVectors(pick(a, 'L'), pick(b, 'L'), k)
      out.q.slerpQuaternions(pick(a, 'q'), pick(b, 'q'), k)
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
    const cursor = { x: 0, y: 0, active: false, at: -10 }
    const look = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
    const lookGoal = { yaw: 0, pitch: 0 }
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const lookPlane = new THREE.Plane()
    const camDir = new THREE.Vector3()
    const hit = new THREE.Vector3()
    const headW = new THREE.Vector3()
    const toCursor = new THREE.Vector3()

    const onWindowPointer = (e) => {
      if (e.pointerType !== 'mouse') return
      cursor.x = e.clientX
      cursor.y = e.clientY
      cursor.active = true
      cursor.at = now
    }
    const onCursorGone = () => {
      cursor.active = false
    }
    window.addEventListener('pointermove', onWindowPointer, { passive: true })
    document.documentElement.addEventListener('mouseleave', onCursorGone)
    window.addEventListener('blur', onCursorGone)

    const updateLook = (dt) => {
      lookGoal.yaw = lookGoal.pitch = 0
      if (cursor.active && !interacting && !calmMotion) {
        const rect = renderer.domElement.getBoundingClientRect()
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
            lookGoal.pitch =
              clamp(-Math.atan2(toCursor.y, Math.hypot(toCursor.x, toCursor.z)), -0.22, 0.3) * facing
          }
        }
      }
      let r = spring(look.yaw, look.vy, lookGoal.yaw, 5, dt)
      look.yaw = r.x
      look.vy = r.v
      r = spring(look.pitch, look.vp, lookGoal.pitch, 5, dt)
      look.pitch = r.x
      look.vp = r.v
    }

    /* ---- Tooltip: on hover, focus or tap — never left up ---- */
    let tipTimer = 0
    let hoverTimer = 0
    const showTip = (ms) => {
      if (disposed) return
      clearTimeout(tipTimer)
      setTip(true)
      if (ms) tipTimer = setTimeout(() => !disposed && setTip(false), ms)
    }
    const hideTip = () => {
      clearTimeout(tipTimer)
      clearTimeout(hoverTimer)
      if (!disposed) setTip(false)
    }

    // A tap or click — not a drag — toggles meditation and shows the tooltip.
    let press = null
    const onPointerDown = (e) => {
      press = { x: e.clientX, y: e.clientY, t: performance.now() }
    }
    const onPointerUp = (e) => {
      if (!press) return
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      if (moved < 6 && performance.now() - press.t < 450) {
        toggleMeditation()
        showTip(2600)
      }
      press = null
    }
    const onPointerEnter = (e) => {
      if (e.pointerType !== 'mouse') return
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => showTip(0), 350)
    }
    const onPointerLeave = (e) => {
      if (e.pointerType === 'mouse') hideTip()
    }
    const onKeyDown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      toggleMeditation()
    }
    const onFocus = () => {
      try {
        if (!mount.matches(':focus-visible')) return
      } catch {
        // Older engines without :focus-visible: show it on any focus.
      }
      showTip(0)
    }
    const hitEl = hitRef.current
    const targets = [mount, hitEl].filter(Boolean)
    targets.forEach((el) => {
      el.addEventListener('pointerdown', onPointerDown)
      el.addEventListener('pointerup', onPointerUp)
      el.addEventListener('pointerenter', onPointerEnter)
      el.addEventListener('pointerleave', onPointerLeave)
    })
    mount.addEventListener('keydown', onKeyDown)
    mount.addEventListener('focus', onFocus)
    mount.addEventListener('blur', hideTip)
    controls.addEventListener('start', hideTip)

    /* ---- Dock: follow the visitor down the page on wide screens ---- */
    const frameEl = frameRef.current
    const slotEl = slotRef.current
    const dismissEl = dismissRef.current
    const DOCK_KEY = 'samurai-companion'
    const dock = { on: false }
    let slotVisible = true
    let dismissed = false
    let undockTimer = 0
    try {
      dismissed = sessionStorage.getItem(DOCK_KEY) === 'hidden'
    } catch {
      // Storage blocked: he simply docks as usual.
    }
    const setDock = () => {
      const want = started && !slotVisible && !dismissed && dockQuery.matches
      if (want === dock.on || !frameEl) return
      dock.on = want
      frameEl.classList.toggle('is-docked', want)
      frameEl.classList.toggle('is-undocking', !want)
      clearTimeout(undockTimer)
      if (!want) undockTimer = setTimeout(() => frameEl.classList.remove('is-undocking'), 600)
      controls.enableRotate = !want
      hideTip()
      wake()
    }
    const onDismiss = () => {
      dismissed = true
      try {
        sessionStorage.setItem(DOCK_KEY, 'hidden')
      } catch {
        // Not remembered, but hidden for now.
      }
      setDock()
    }
    dismissEl?.addEventListener('click', onDismiss)
    // The fixed nav covers the top of the viewport, so the slot counts as
    // gone once it is only behind the nav.
    const slotWatcher = new IntersectionObserver(
      (entries) => {
        slotVisible = entries.some((e) => e.isIntersecting)
        setDock()
      },
      { rootMargin: '-64px 0px 0px 0px' }
    )
    if (slotEl) slotWatcher.observe(slotEl)
    dockQuery.addEventListener('change', setDock)

    const onMotionPref = () => {
      calmMotion = motionQuery.matches
      if (calmMotion) {
        action = null
        settle()
      }
    }
    motionQuery.addEventListener('change', onMotionPref)

    /* ---- Companion store ---- */
    let lastActionId = getState().action?.id ?? 0
    const unsubscribe = subscribe((s) => {
      onMood(s.mood)
      if (s.action && s.action.id !== lastActionId) {
        lastActionId = s.action.id
        startAction(s.action.name)
      }
    })
    onMood(getState().mood)

    /* ---- Ambient occlusion: desktop only, switched on after first paint ---- */
    let composer = null
    let aoParts = null
    const enableAO = async () => {
      const aoTarget = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: Math.min(8, renderer.capabilities.maxSamples),
      })
      const c = new EffectComposer(renderer, aoTarget)
      c.setPixelRatio(dpr)
      c.setSize(mount.clientWidth, mount.clientHeight)
      c.addPass(new RenderPass(scene, camera))
      const gtao = new GTAOPass(scene, camera, mount.clientWidth, mount.clientHeight)
      gtao.updateGtaoMaterial({
        radius: 0.32,
        distanceExponent: 1,
        thickness: 1,
        scale: 3,
        samples: 20,
      })
      gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 })
      // The eye halos are additive sprites: keep them out of the normal /
      // depth pass, or the AO would treat them as solid plates.
      const gtaoRender = gtao.render.bind(gtao)
      gtao.render = (...args) => {
        glows.forEach((g) => (g.visible = false))
        gtaoRender(...args)
        glows.forEach((g) => (g.visible = true))
      }
      c.addPass(gtao)
      const output = new OutputPass()
      c.addPass(output)
      aoParts = { composer: c, gtao, output }

      // Rendering into an off-screen target needs different variants of every
      // shader (no tone mapping, linear output), plus the pass shaders. Compile
      // them all in parallel before swapping the composer in, so turning AO on
      // never stalls a frame. Each warm-up has to match how the pass really
      // draws, or its cache key differs and the work is wasted:
      //  - the normal pass draws the real scene, so it takes the scene's lights;
      //  - the fullscreen passes draw one triangle through an orthographic
      //    camera, with no lights.
      // compile() runs synchronously for whichever target is bound, so the
      // target only needs binding around the calls.
      const tri = new THREE.BufferGeometry()
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3))
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2))
      const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const normals = new THREE.Mesh(tri, gtao.normalMaterial)
      const passes = new THREE.Scene()
      ;[gtao.gtaoMaterial, gtao.pdMaterial, gtao.copyMaterial, gtao.blendMaterial].forEach((m) =>
        passes.add(new THREE.Mesh(tri, m))
      )
      renderer.setRenderTarget(aoTarget)
      const compiling = Promise.all([
        renderer.compileAsync(scene, camera),
        renderer.compileAsync(normals, camera, scene),
        renderer.compileAsync(passes, ortho),
      ])
      renderer.setRenderTarget(null)
      try {
        await compiling
      } catch {
        // Worst case the shaders compile on first use instead.
      }
      tri.dispose()
      if (!disposed) composer = c
    }

    /* ---- Per-frame scratch ---- */
    const X_AXIS = new THREE.Vector3(1, 0, 0)
    const Y_AXIS = new THREE.Vector3(0, 1, 0)
    const IDENTITY = new THREE.Quaternion()
    const restShoulderQ = [-1, 1].map((side) =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.16))
    )
    const sodeBaseQ = arms.map(({ sode }) => sode.quaternion.clone())
    const ik = { q: new THREE.Quaternion(), bend: 0 }
    const armState = [{ swivel: 0 }, { swivel: 0 }]
    const seatedShoulderQ = [-1, 1].map((side) =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, side * 0.2))
    )
    const rHand = new THREE.Vector3()
    const lHand = new THREE.Vector3()
    const gripPoint = new THREE.Vector3()
    const bladeQ = new THREE.Quaternion()
    const handQ = new THREE.Quaternion()
    const tmpQ = new THREE.Quaternion()
    const eyeBase = cssColor('--samurai-eye', '#ffb347')
    const eyeHot = new THREE.Color('#ff4a2a')
    const eyeWarm = new THREE.Color('#fff1cf')
    const eyeTint = new THREE.Color()
    const orbit = new THREE.Spherical()
    const offset = new THREE.Vector3()
    const HERO_RADIUS = camera.position.distanceTo(controls.target)
    // Docked, he turns a little toward the page content on his right.
    const DOCK = { theta: 0.42, phi: Math.PI / 2 - 0.1, radius: 8.1, aimY: 1.9 }
    let breathPhase = 0

    const dampTo = (x, goal, rate, dt) => goal + (x - goal) * Math.exp(-rate * dt)
    const dampAngle = (x, goal, rate, dt) => {
      let d = goal - x
      d = Math.atan2(Math.sin(d), Math.cos(d))
      return x + d * (1 - Math.exp(-rate * dt))
    }

    /* ---- One frame of animation ---- */
    const update = (dt, t) => {
      const still = calmMotion ? 0 : 1

      // Meditation: he rises on his own in any mood, but only sits when calm.
      if (!calmMotion && !action) {
        if (pose.to === 1 && t >= pose.next) toggleMeditation()
        else if (pose.to === 0 && mood === 'calm' && t >= pose.next) toggleMeditation()
      }
      const k = clamp((t - pose.start) / TRANSITION, 0, 1)
      const w = (pose.w = lerp(pose.from, pose.to, smootherstep(k)))
      const stand = 1 - w
      // Peaks mid-transition: he leans into the motion of sitting or rising.
      const effort = Math.sin(Math.PI * k) * Math.abs(pose.to - pose.from)

      followMood(dt)
      if (action) evalAction()
      else copyPose(out, cur)
      const P = out.s
      const sway = P.sway * stand * still

      /* Idle life */
      let blink = 1
      let glanceYaw = 0
      let glancePitch = 0
      let shiftTilt = 0
      let shiftTwist = 0
      let gripRoll = 0
      if (still) {
        if (t >= micro.blinkAt) {
          micro.blinkStart = t
          micro.blinkAt = t + 2.6 + Math.random() * 4.2
        }
        blink = 1 - 0.92 * bump((t - micro.blinkStart) / 0.17)

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

        if (!action && stand > 0.95 && t >= micro.shiftAt) {
          micro.shift = { start: t, dir: Math.random() < 0.5 ? -1 : 1 }
          micro.shiftAt = t + 9 + Math.random() * 6
        }
        if (micro.shift) {
          const g = envelope((t - micro.shift.start) / 2.6, 0.35, 0.4)
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

      /* Legs and stance: bent knees lower the hips, feet stay on the floor */
      const alpha = P.crouch * stand
      const splay = P.splay * stand
      legs.forEach(({ hip, knee, ankle, side }) => {
        const drift = Math.sin(t * 0.5 + side * 1.6) * 0.012 * sway
        hip.position.y = HIP_Y - LEG_DROP * w
        hip.rotation.set(drift - 1.52 * w - alpha, side * lerp(0.1, 0.16, w), side * splay)
        knee.rotation.x = 2.42 * w + 2 * alpha
        ankle.rotation.x = 2.29 * w - alpha
      })
      saya.quaternion.slerpQuaternions(sayaStand, sayaSeated, THREE.MathUtils.smoothstep(w, 0, 0.6))
      const drop = Math.cos(0.05) - Math.cos(alpha) * Math.cos(splay)
      samurai.position.y = -SIT_DROP * w + stand * (P.lift - drop) + Math.sin(t * 1.1) * 0.014 * sway
      samurai.rotation.z = Math.sin(t * 0.5) * 0.01 * sway
      // A whirlwind turns the whole figure; a full turn ends where it began.
      let turn = 0
      if (action?.def.spin) {
        const [from, to, angle] = action.def.spin
        turn = smootherstep(clamp(((now - action.start) / action.def.duration - from) / (to - from), 0, 1)) * angle
      }
      samurai.rotation.y = turn

      /* Body: lean, turn, breathing, armour that settles with it */
      const bodyYaw =
        Math.sin(t * 0.42) * 0.045 * sway + (P.twist + shiftTwist + lookYaw * 0.2) * stand
      body.rotation.set(0.04 * w + effort * 0.22 + P.lean * stand, bodyYaw, (P.tilt + shiftTilt) * stand)

      breathPhase += dt * P.breathRate
      const breathe = Math.sin(breathPhase) * P.breathDepth * stand * still
      const deep = Math.sin(t * 1.0)
      torso.scale.set(1, 1 + breathe + deep * 0.028 * w, 1)
      cuirass.scale.set(1 + breathe * 0.4, 1, 0.74 * (1 + breathe * 0.4))
      skirt.rotation.set(-P.lean * stand * 0.75, Math.sin(t * 0.42) * 0.03 * sway, 0)
      panels.forEach(({ flap, spread }, i) => {
        flap.rotation.x = -spread * w - stand * alpha * 0.45 - Math.sin(t * 1.3 + i * 1.7) * 0.012 * sway
      })
      tails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(t * 1.2 + i * 0.8) * 0.1 * sway + 0.35 * w
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

      /* Arms: IK to the pose's hands, blended with the seated pose */
      bladeQ.copy(out.q)
      bladeQ.premultiply(tmpQ.setFromAxisAngle(X_AXIS, Math.sin(t * 0.9) * 0.03 * sway))
      if (gripRoll) bladeQ.multiply(tmpQ.setFromAxisAngle(Y_AXIS, gripRoll))
      // Hands never pass through the armour: between poses they slide round it.
      rHand.copy(out.R)
      rHand.z += Math.sin(t * 1.05 + 1) * 0.03 * sway
      keepOutOfBody(rHand, 0.11)
      gripPoint.set(0, -GRIP_SPAN, 0).applyQuaternion(bladeQ).add(rHand)
      lHand.copy(out.L)
      lHand.z += Math.sin(t * 1.05 - 1) * 0.03 * sway
      lHand.lerp(gripPoint, clamp(P.twoHand, 0, 1))
      keepOutOfBody(lHand, 0.11)

      arms.forEach(({ shoulder, elbow, side, sode }, i) => {
        solveArm(side > 0 ? rHand : lHand, side, armState[i], dt, ik)
        shoulder.quaternion.slerpQuaternions(ik.q, seatedShoulderQ[i], w)
        elbow.rotation.set(lerp(-ik.bend, -1.35, w), 0, side * -0.3 * w)
        // The sode hang from the shoulder: they follow the arm only a little.
        tmpQ.copy(shoulder.quaternion).invert().multiply(restShoulderQ[i])
        sode.quaternion.slerpQuaternions(IDENTITY, tmpQ, 0.8).multiply(sodeBaseQ[i])
      })

      /* Katana: the pose's blade in body space, carried into the hand's frame */
      const kw = THREE.MathUtils.smoothstep(w, 0, 0.55)
      if (kw > 0) bladeQ.slerp(tmpQ.copy(body.quaternion).invert().multiply(katanaLap), kw)
      handQ.copy(arms[1].shoulder.quaternion).multiply(arms[1].elbow.quaternion)
      katana.quaternion.copy(handQ.invert()).multiply(bladeQ)
      mats.steel.envMapIntensity = 2.4 + P.glint * 1.6

      /* Eyes: open, tilt, glow and colour carry most of the emotion */
      const glowLevel = lerp(P.eyeGlow + Math.sin(t * 0.85) * 0.1 * still, 0.45 + deep * 0.3, w)
      mats.eye.emissiveIntensity = glowLevel
      glowMat.opacity = glowLevel * 0.55
      eyeTint.copy(eyeBase).lerp(P.heat >= 0 ? eyeHot : eyeWarm, Math.min(Math.abs(P.heat), 1))
      mats.eye.color.copy(eyeTint)
      mats.eye.emissive.copy(eyeTint)
      glowMat.color.copy(eyeTint)
      const open = P.eyeOpen * blink
      eyes.forEach((eye, i) => {
        const side = i === 0 ? -1 : 1
        eye.scale.y = lerp(open * (1 + Math.sin(t * 0.85 + i) * 0.03 * still), 0.3, w)
        eye.rotation.z = side * lerp(P.eyeTilt, 0.06, w)
        glows[i].scale.y = lerp(0.6 + 0.4 * open, 0.55, w)
        glows[i].rotation.z = eye.rotation.z
      })

      /* Camera: the hero orbit, or a fixed three-quarter view when docked */
      const aimY = lerp(dock.on ? DOCK.aimY : STAND_TARGET_Y, SIT_TARGET_Y, w)
      camera.position.y += aimY - controls.target.y
      controls.target.y = aimY
      offset.copy(camera.position).sub(controls.target)
      orbit.setFromVector3(offset)
      if (dock.on) {
        orbit.theta = dampAngle(orbit.theta, DOCK.theta, 4, dt)
        orbit.phi = dampTo(orbit.phi, DOCK.phi, 4, dt)
      }
      orbit.radius = dampTo(orbit.radius, dock.on ? DOCK.radius : HERO_RADIUS, 4, dt)
      camera.position.copy(controls.target).add(offset.setFromSpherical(orbit))
      controls.autoRotate = autoSpin && !dock.on && !calmMotion
      controls.update(dt)
    }

    /* ---- The loop: runs only while he is on screen and the tab is shown ---- */
    const t0 = performance.now()

    const loop = () => {
      frame = null
      if (!started || !gate?.visible || document.hidden) return
      frame = requestAnimationFrame(loop)
      const t = (performance.now() - t0) / 1000
      // Docked, he is small: 30 fps is plenty, and halves the GPU cost.
      if (dock.on && t - last < 1 / 31) return
      const dt = last ? Math.min(t - last, 0.1) : 0
      last = t
      now = t
      update(dt, t)
      if (composer && !dock.on) composer.render()
      else renderer.render(scene, camera)
    }
    function wake() {
      if (frame !== null || !started || !gate?.visible || document.hidden) return
      last = 0
      frame = requestAnimationFrame(loop)
    }

    gate = createVisibilityGate(mount, wake)
    document.addEventListener('visibilitychange', wake)

    // Compile every shader in parallel (without blocking the page), then
    // start drawing and fade the canvas in. AO follows once the page is idle.
    const start = async () => {
      envTexture = await bakedEnv
      fillTextureSlots(maps, await texturesReady)
      extraMaps.forEach((t) => (t.needsUpdate = true))
      if (disposed) return
      if (!envTexture) {
        envFallback = renderStudioPMREM(renderer)
        envTexture = envFallback.texture
      }
      scene.environment = envTexture
      try {
        await renderer.compileAsync(scene, camera)
      } catch {
        // Fall back to compiling on first render.
      }
      if (disposed) return
      started = true
      mount.classList.add('is-ready')
      setDock()
      wake()
      if (finePointer) {
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400))
        idle(() => {
          if (!disposed) enableAO()
        })
      }
    }
    start()

    /* ---- Theme ---- */
    const applyTheme = () => {
      mats.fabric.color.copy(cssColor('--samurai-fabric', '#171a21'))
      mats.red.color.copy(cssColor('--samurai-accent', '#c0392b'))
      mats.redDark.color.copy(cssColor('--samurai-accent-dark', '#8e2a1e'))
      mats.redLame.color.copy(cssColor('--samurai-accent', '#c0392b'))
      mats.redDarkLame.color.copy(cssColor('--samurai-accent-dark', '#8e2a1e'))
      mats.metal.color.copy(cssColor('--samurai-armor', '#39414f'))
      mats.kusari.color.copy(cssColor('--samurai-armor', '#39414f'))
      mats.metalDark.color.copy(cssColor('--samurai-armor-dark', '#22272f'))
      mats.gold.color.copy(cssColor('--samurai-gold', '#e0a63a'))
      mats.rope.color.copy(cssColor('--samurai-rope', '#b8935a'))
      mats.straw.color.copy(cssColor('--samurai-rope', '#b8935a'))
      mats.bowl.color.copy(cssColor('--samurai-bowl', '#e8e1d4'))
      mats.steel.color.copy(cssColor('--samurai-steel', '#e9edf4'))
      mats.cloth.color.copy(cssColor('--samurai-cloth', '#a8322a'))
      mats.leather.color.copy(cssColor('--samurai-leather', '#4a3b33'))
      mats.helmetLacing.color.copy(cssColor('--samurai-helmet-lacing', '#232a3d'))
      // The eyes are tinted by mood every frame, starting from this colour.
      eyeBase.copy(cssColor('--samurai-eye', '#ffb347'))
      wake()
    }
    const themeWatcher = new MutationObserver(applyTheme)
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    /* ---- Resize ---- */
    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      aoParts?.composer.setSize(w, h)
    }
    const resizeWatcher = new ResizeObserver(onResize)
    resizeWatcher.observe(mount)

    /* ---- Teardown ---- */
    return () => {
      disposed = true
      if (frame !== null) cancelAnimationFrame(frame)
      clearTimeout(resumeTimer)
      clearTimeout(tipTimer)
      clearTimeout(hoverTimer)
      clearTimeout(undockTimer)
      unsubscribe()
      gate.dispose()
      slotWatcher.disconnect()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      dockQuery.removeEventListener('change', setDock)
      motionQuery.removeEventListener('change', onMotionPref)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('pointermove', onWindowPointer)
      document.documentElement.removeEventListener('mouseleave', onCursorGone)
      window.removeEventListener('blur', onCursorGone)
      targets.forEach((el) => {
        el.removeEventListener('pointerdown', onPointerDown)
        el.removeEventListener('pointerup', onPointerUp)
        el.removeEventListener('pointerenter', onPointerEnter)
        el.removeEventListener('pointerleave', onPointerLeave)
      })
      mount.removeEventListener('keydown', onKeyDown)
      mount.removeEventListener('focus', onFocus)
      mount.removeEventListener('blur', hideTip)
      dismissEl?.removeEventListener('click', onDismiss)
      frameEl?.classList.remove('is-docked', 'is-undocking')
      mount.classList.remove('is-ready')
      controls.dispose()

      geos.forEach((g) => g.dispose())
      geos.clear()
      allMats.forEach((m) => m.dispose())
      Object.values(maps).forEach((t) => t.dispose())
      extraMaps.forEach((t) => t.dispose())
      shadowMat.dispose()
      poolMat.dispose()
      poolTex.dispose()
      if (aoParts) {
        aoParts.gtao.dispose()
        aoParts.output.dispose()
        aoParts.composer.dispose()
      }
      // The baked texture is shared across mounts; this only frees this
      // renderer's GPU copy; it re-uploads if the component mounts again.
      envTexture?.dispose()
      envFallback?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="samurai-slot" ref={slotRef}>
      <div className="samurai-frame" ref={frameRef}>
        <div
          className="robot3d samurai3d"
          ref={mountRef}
          role="button"
          tabIndex={0}
          aria-label="3D samurai companion. Drag to turn him; click, tap or press Enter to meditate or stand up."
          aria-describedby={tip ? 'samurai-tip' : undefined}
        />
        {/* Docked, only his silhouette takes clicks; the rest of the box lets them through. */}
        <div className="samurai-hit" ref={hitRef} aria-hidden="true" />
        {tip && (
          <span className="samurai-tip" id="samurai-tip" role="tooltip">
            Your guide through the portfolio.
            <span className="samurai-tip-keys">
              Moves:{' '}
              {MOVES.map((m) => (
                <kbd key={m.key}>{m.key}</kbd>
              ))}
            </span>
          </span>
        )}
        <button
          type="button"
          className="samurai-dismiss"
          ref={dismissRef}
          aria-label="Hide the samurai companion"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
