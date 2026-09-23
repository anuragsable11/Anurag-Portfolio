import { useEffect, useRef } from 'react'
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

/**
 * An original stylised samurai mascot, modelled from primitives.
 *
 * The character is chibi, but the armour is built the way real armour is:
 * a dark fabric body underneath, with separate plates laced over the top and
 * visible gaps between them.
 *
 *  - Every plate is a solid, bevelled shell with real thickness, so its edges
 *    catch the light instead of reading as paper.
 *  - Sode, kusazuri, the lower dō and the shikoro are lamellar: rows of lames
 *    joined by vertical pairs of silk cord (sugake odoshi).
 *  - Shins and forearms are guarded by separate splints over the fabric.
 *  - Materials are physical: clear-coated urushi lacquer, hammered iron,
 *    polished gold, brushed steel, woven fabric with sheen. Procedural maps
 *    add grain, mottling and fine scratches so nothing looks factory-clean.
 *  - On desktop, ambient occlusion darkens the gaps between plates.
 *
 * He idles standing, then periodically sits cross-legged to meditate — the
 * katana laid across his lap, eyes dimmed to slits that glow with each
 * breath — and later rises again. Click / tap / Enter toggles it at once.
 *
 * Load time is dominated by GPU shader compilation, so the scene is built to
 * keep that small: the reflection map is baked offline (see studio-env.js),
 * every material shares one of three shader programs, repeated pieces are
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
// How far the whole figure drops to sit on the floor.
const SIT_DROP = HIP_Y - 0.24

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
const smootherstep = (k) => k * k * k * (k * (k * 6 - 15) + 10)

/* ================================================================
   Procedural surface maps
   ================================================================ */

/** Seeded, so the wear pattern is identical on every load. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Tileable value noise, summed over octaves of [cells, weight], in 0..1. */
function tileNoise(size, rand, octaves) {
  const out = new Float32Array(size * size)
  let total = 0
  for (const [cells, weight] of octaves) {
    const grid = Float32Array.from({ length: cells * cells }, rand)
    const at = (x, y) => grid[(y % cells) * cells + (x % cells)]
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells
      const y0 = Math.floor(gy)
      const fy = gy - y0
      const sy = fy * fy * (3 - 2 * fy)
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells
        const x0 = Math.floor(gx)
        const fx = gx - x0
        const sx = fx * fx * (3 - 2 * fx)
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
        out[y * size + x] += (top + (bottom - top) * sy) * weight
      }
    }
    total += weight
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function canvasTexture(size, draw, { srgb = false, repeat = 1 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 4
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Writes a 0..1 field into the canvas as grey, remapped to [lo, hi]. */
function paintField(ctx, size, field, lo, hi) {
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < field.length; i++) {
    const v = Math.round((lo + field[i] * (hi - lo)) * 255)
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

function makeSurfaceMaps() {
  // Roughness variation: broad patches plus fine grain.
  const grain = canvasTexture(256, (ctx, size) => {
    const field = tileNoise(size, rng(11), [[6, 0.5], [24, 0.3], [128, 0.2]])
    paintField(ctx, size, field, 0.72, 1)
  })

  // Colour mottling and hairline scratches — handled, not factory-new.
  const mottle = canvasTexture(
    256,
    (ctx, size) => {
      const rand = rng(23)
      const field = tileNoise(size, rand, [[4, 0.6], [16, 0.4]])
      paintField(ctx, size, field, 0.86, 1)
      ctx.lineCap = 'round'
      for (let i = 0; i < 70; i++) {
        const x = rand() * size
        const y = rand() * size
        const len = 6 + rand() * 30
        const a = rand() * Math.PI
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + rand() * 0.14})`
        ctx.lineWidth = 0.5 + rand() * 0.7
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
        ctx.stroke()
      }
    },
    { srgb: true }
  )

  // Hammer marks for the iron: shallow dimples, wrapped so they tile.
  const hammer = canvasTexture(256, (ctx, size) => {
    const rand = rng(37)
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 160; i++) {
      const x = rand() * size
      const y = rand() * size
      const r = 5 + rand() * 11
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
          g.addColorStop(0, 'rgba(0,0,0,0.22)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2)
        }
      }
    }
  })

  // Plain weave for the fabric and silk cord.
  const weave = canvasTexture(
    64,
    (ctx, size) => {
      const cell = size / 8
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const across = (x + y) % 2 === 0
          const g = across
            ? ctx.createLinearGradient(0, y * cell, 0, (y + 1) * cell)
            : ctx.createLinearGradient(x * cell, 0, (x + 1) * cell, 0)
          g.addColorStop(0, '#3a3a3a')
          g.addColorStop(0.5, '#e0e0e0')
          g.addColorStop(1, '#3a3a3a')
          ctx.fillStyle = g
          ctx.fillRect(x * cell, y * cell, cell, cell)
        }
      }
    },
    { repeat: 14 }
  )

  // Polishing streaks running along the blade's length.
  const brushed = canvasTexture(256, (ctx, size) => {
    const rand = rng(53)
    const img = ctx.createImageData(size, size)
    const columns = Array.from({ length: size }, rand)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = Math.round((0.55 + columns[x] * 0.3 + rand() * 0.15) * 255)
        const i = (y * size + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  })

  return { grain, mottle, hammer, weave, brushed }
}

/* ================================================================
   Geometry builders
   ================================================================ */

/**
 * A curved armour plate with real thickness and softened edges: an annular
 * sector extruded vertically, then tapered so it can flare like a skirt.
 * `rTop` / `rBottom` are the outer surface; thickness goes inward.
 */
function shellGeometry(rTop, rBottom, height, [start, sweep], thickness, segs) {
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
    const t = THREE.MathUtils.clamp(pos.getY(i) / height + 0.5, 0, 1)
    const k = (rBottom + (rTop - rBottom) * t) / r
    pos.setX(i, pos.getX(i) * k)
    pos.setZ(i, pos.getZ(i) * k)
  }

  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * UV_SCALE, uv.getY(i) * UV_SCALE)
  }

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
  return geo
}

/** Bakes copies of `base` at each matrix into a single geometry. */
function mergeCopies(base, matrices) {
  const parts = matrices.map((m) => base.clone().applyMatrix4(m))
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

/** A katana blade with sori (curvature) and a swept kissaki point. */
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
  for (let i = 1; i <= 16; i++) {
    const y = (length * i) / 16
    shape.lineTo(spine(y), y)
  }
  shape.lineTo(spine(length) + 0.006, length + 0.035)
  const yp = length - point
  shape.quadraticCurveTo(edge(length) + 0.004, length, edge(yp), yp)
  for (let i = 15; i >= 0; i--) {
    const y = (yp * i) / 15
    shape.lineTo(edge(y), y)
  }
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.0065,
    bevelSegments: 2,
    curveSegments: 12,
  })
  geo.translate(0, 0, -0.005)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * UV_SCALE, uv.getY(i) * UV_SCALE * 0.5)
  }
  const creased = toCreasedNormals(geo, 0.7)
  if (creased !== geo) geo.dispose()
  return creased
}

export default function Samurai3D() {
  const mountRef = useRef(null)

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
    scene.environmentIntensity = 0.6
    let envTexture = null
    let envFallback = null

    const key = new THREE.DirectionalLight(0xfff3e6, 2.5)
    key.position.set(3.6, 6.5, 5.2)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -4
    key.shadow.camera.right = 4
    key.shadow.camera.top = 6
    key.shadow.camera.bottom = -1.5
    key.shadow.bias = -0.0008
    key.shadow.normalBias = 0.02
    key.shadow.radius = 4

    const rimL = new THREE.DirectionalLight(0xa8c8ff, 2.3)
    rimL.position.set(-4.5, 3.5, -5)
    const rimR = new THREE.DirectionalLight(0xbcd4ff, 1.5)
    rimR.position.set(4.5, 2.5, -4.5)
    const fill = new THREE.DirectionalLight(0xdfe7f5, 0.3)
    fill.position.set(-3.5, 1.2, 4)
    scene.add(key, rimL, rimR, fill)

    /* ---- Controls ---- */
    const STAND_TARGET_Y = 1.95
    const SIT_TARGET_Y = 1.45
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, STAND_TARGET_Y, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = 0.85
    controls.minPolarAngle = 0.55
    controls.maxPolarAngle = Math.PI / 2 + 0.14
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.7

    // Touch drags orbit as well. OrbitControls otherwise pins the canvas to
    // `touch-action: none`, which swallows page scrolling, so it is put back
    // to `pan-y`: a sideways drag spins the samurai, while a vertical swipe
    // is claimed by the browser to scroll and cancels the drag mid-gesture.
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null }
    renderer.domElement.style.touchAction = 'pan-y'

    let interacting = false
    let resumeTimer
    controls.addEventListener('start', () => {
      interacting = true
      controls.autoRotate = false
      clearTimeout(resumeTimer)
    })
    controls.addEventListener('end', () => {
      interacting = false
      resumeTimer = setTimeout(() => {
        controls.autoRotate = true
      }, 2500)
    })

    /* ================================================================
       Materials — three shader programs between them
       ================================================================ */
    const maps = makeSurfaceMaps()
    const geos = new Set()
    const track = (g) => {
      geos.add(g)
      return g
    }

    // three.js compiles one program per distinct feature set, and on many
    // GPUs each compile costs hundreds of milliseconds. Every material below
    // is one of three families with identical map slots, so they share
    // programs: vary colours and scalars freely, but keep the slots the same.
    const surface = { map: maps.mottle, roughnessMap: maps.grain }

    // Urushi lacquer (and waxed leather): pigment under a hard clear coat.
    const lacquered = (token, fallback, extra = {}) =>
      new THREE.MeshPhysicalMaterial({
        color: cssColor(token, fallback),
        metalness: 0,
        roughness: 0.4,
        clearcoat: 1,
        clearcoatRoughness: 0.07,
        envMapIntensity: 0.55,
        ...surface,
        ...extra,
      })

    // Metals: forged iron with hammer marks, gold, steel.
    const metallic = (token, fallback, extra = {}) =>
      new THREE.MeshStandardMaterial({
        color: cssColor(token, fallback),
        metalness: 0.88,
        ...surface,
        bumpMap: maps.hammer,
        bumpScale: 1.2,
        ...extra,
      })

    // Fabric and silk cord: a plain weave with a soft sheen.
    const woven = (token, fallback, extra = {}) =>
      new THREE.MeshPhysicalMaterial({
        color: cssColor(token, fallback),
        metalness: 0,
        roughness: 0.9,
        sheen: 1,
        sheenRoughness: 0.6,
        bumpMap: maps.weave,
        bumpScale: 0.7,
        ...extra,
      })

    const mats = {
      fabric: woven('--samurai-fabric', '#171a21', {
        roughness: 0.95,
        sheenColor: new THREE.Color(0x4a5566),
      }),
      cloth: woven('--samurai-cloth', '#a8322a', { sheenColor: new THREE.Color(0xff9d8a) }),
      rope: woven('--samurai-rope', '#b8935a', {
        roughness: 0.62,
        sheenRoughness: 0.35,
        sheenColor: new THREE.Color(0xfff0d8),
        bumpScale: 0.8,
      }),
      red: lacquered('--samurai-accent', '#c0392b'),
      redDark: lacquered('--samurai-accent-dark', '#8e2a1e'),
      bowl: lacquered('--samurai-bowl', '#e8e1d4', { roughness: 0.42 }),
      leather: lacquered('--samurai-leather', '#4a3b33', {
        roughness: 0.62,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
        envMapIntensity: 1,
      }),
      metal: metallic('--samurai-armor', '#39414f', { roughness: 0.46 }),
      metalDark: metallic('--samurai-armor-dark', '#22272f', { roughness: 0.4 }),
      face: metallic('--samurai-face', '#2f3642', { roughness: 0.5 }),
      // Polished metals get a stronger reflection than the forged iron.
      gold: metallic('--samurai-gold', '#e0a63a', {
        metalness: 1,
        roughness: 0.24,
        bumpScale: 0.3,
        envMapIntensity: 1.8,
      }),
      steel: metallic('--samurai-steel', '#e9edf4', {
        metalness: 1,
        roughness: 0.16,
        roughnessMap: maps.brushed,
        bumpScale: 0,
        envMapIntensity: 1.5,
      }),
      // Rides on the metal program: the emissive term is always compiled in.
      eye: metallic('--samurai-eye', '#ffb347', {
        metalness: 0.1,
        roughness: 0.3,
        bumpScale: 0,
        emissive: cssColor('--samurai-eye', '#ffb347'),
        emissiveIntensity: 0.8,
      }),
    }
    const allMats = Object.values(mats)

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
    const plate = (rTop, rBottom, height, [start, sweep], material, thickness = 0.026, segs = 14) => {
      const key = [rTop, rBottom, height, sweep, thickness, segs].map((v) => v.toFixed(4)).join()
      let geo = shellCache.get(key)
      if (!geo) {
        geo = track(shellGeometry(rTop, rBottom, height, arc(0, sweep), thickness, segs))
        shellCache.set(key, geo)
      }
      const m = new THREE.Mesh(geo, material)
      m.castShadow = true
      m.receiveShadow = true
      m.rotation.y = start + sweep / 2
      return m
    }

    const STUD = track(new THREE.SphereGeometry(0.026, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2))
    const stud = (parent, x, y, z, rotY = 0) => {
      const s = new THREE.Mesh(STUD, mats.gold)
      s.castShadow = true
      s.position.set(x, y, z)
      s.rotation.set(Math.PI / 2, rotY, 0, 'YXZ')
      parent.add(s)
      return s
    }

    /* ---- Silk lacing: every cord of a group merged into one mesh ---- */
    const CORD = track(new THREE.CylinderGeometry(0.0085, 0.0085, 1, 6, 1))
    const UP = new THREE.Vector3(0, 1, 0)
    const lace = (parent, segments) => {
      if (!segments.length) return
      const q = new THREE.Quaternion()
      const mid = new THREE.Vector3()
      const dir = new THREE.Vector3()
      const matrices = segments.map(([a, b]) => {
        dir.subVectors(b, a)
        const len = dir.length()
        q.setFromUnitVectors(UP, dir.normalize())
        mid.addVectors(a, b).multiplyScalar(0.5)
        return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1))
      })
      parent.add(mesh(mergeCopies(CORD, matrices), mats.rope))
    }

    /**
     * Rows of lames laced together with pairs of silk cord — how sode,
     * kusazuri and shikoro are really built. The radius grows linearly
     * downward by `flare`, so the rows open out like a skirt.
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
        hang = 0,
        cordsPer = 3,
        thickness = 0.024,
      }
    ) => {
      const group = new THREE.Group()
      group.position.y = y
      parent.add(group)

      const rAt = (yy) => rTop - flare * yy
      const cordAt = (a, yy) => {
        const r = rAt(yy) + thickness * 0.32 + 0.011
        return new THREE.Vector3(Math.sin(a) * r, yy, Math.cos(a) * r)
      }
      const [start, sweep] = span
      const segments = []
      const pairs = (yA, yB) => {
        for (let k = 0; k < cordsPer; k++) {
          const a = start + (sweep * (k + 0.5)) / cordsPer
          const spread = 0.022 / rAt(yA)
          for (const o of [-spread, spread]) {
            segments.push([cordAt(a + o, yA), cordAt(a + o, yB)])
          }
        }
      }

      let bottom = 0
      for (let i = 0; i < rows; i++) {
        const top = -i * (rowH + gap)
        bottom = top - rowH
        const mat = Array.isArray(material) ? material[i % material.length] : material
        const lame = plate(rAt(top), rAt(bottom), rowH, span, mat, thickness)
        lame.position.y = top - rowH / 2
        group.add(lame)
        if (i < rows - 1) pairs(bottom + rowH * 0.32, bottom - gap - rowH * 0.32)
      }
      if (hang) pairs(hang, -rowH * 0.32)
      lace(group, segments)

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
      return group
    }

    /* ================================================================
       Legs — fabric underneath, laced thigh lames, splinted shins.
       Each leg bends at the knee so he can sit cross-legged.
       ================================================================ */
    const legs = [-1, 1].map((side) => {
      const hip = new THREE.Group()
      hip.position.set(side * 0.32, HIP_Y, 0)
      // Splay (Y) is applied outside the lift (X), so a raised thigh still
      // swings out sideways rather than twisting.
      hip.rotation.order = 'YXZ'
      samurai.add(hip)

      const thigh = mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.46, 24), mats.fabric)
      thigh.position.y = -0.25
      hip.add(thigh)

      // Haidate: two small laced lames over the front of the thigh
      lamellar(hip, {
        rows: 2,
        rowH: 0.1,
        gap: 0.024,
        rTop: 0.2,
        flare: 0.08,
        span: arc(FRONT, Math.PI * 0.62),
        y: -0.07,
        material: mats.red,
        trim: mats.gold,
        hang: 0.05,
        cordsPer: 2,
      })

      const knee = new THREE.Group()
      knee.position.y = -0.5
      hip.add(knee)

      const kneeCop = mesh(new THREE.SphereGeometry(0.15, 32, 20), mats.red)
      kneeCop.position.set(0, 0, 0.06)
      kneeCop.scale.z = 0.8
      knee.add(kneeCop)

      const kneeTrim = mesh(new THREE.TorusGeometry(0.14, 0.016, 10, 40), mats.gold)
      kneeTrim.position.set(0, 0, 0.13)
      knee.add(kneeTrim)

      const shin = mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.4, 24), mats.fabric)
      shin.position.y = -0.27
      knee.add(shin)

      // Suneate: three separate iron splints, fabric showing between them
      ;[-1, 0, 1].forEach((k) => {
        const splint = plate(0.172, 0.18, 0.32, arc(FRONT + k * 0.64, 0.5), mats.metal, 0.022)
        splint.position.y = -0.29
        knee.add(splint)
      })

      const shinTrim = plate(0.188, 0.19, 0.03, arc(FRONT, Math.PI * 0.86), mats.gold, 0.014)
      shinTrim.position.y = -0.12
      knee.add(shinTrim)

      const foot = mesh(new RoundedBoxGeometry(0.4, 0.15, 0.54, 4, 0.06), mats.metalDark)
      foot.position.set(0, -0.52, 0.09)
      knee.add(foot)

      const sole = mesh(new RoundedBoxGeometry(0.42, 0.05, 0.56, 3, 0.02), mats.leather)
      sole.position.set(0, -0.6, 0.09)
      knee.add(sole)

      const toeStrap = mesh(new RoundedBoxGeometry(0.28, 0.06, 0.12, 3, 0.03), mats.leather)
      toeStrap.position.set(0, -0.46, 0.29)
      knee.add(toeStrap)

      return { hip, knee, side }
    })

    /* ================================================================
       Body — fabric torso, a laced dō, separated kusazuri
       ================================================================ */
    const body = new THREE.Group()
    body.position.y = HIP_Y
    samurai.add(body)

    // The undergarment. Every armour piece sits on top of this with a gap.
    const torso = mesh(new RoundedBoxGeometry(0.7, 0.82, 0.5, 6, 0.2), mats.fabric)
    torso.position.y = 0.46
    body.add(torso)

    const neck = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 20), mats.fabric)
    neck.position.y = 0.93
    body.add(neck)

    // Dō: a solid chest plate on each side, with laced lames hanging below.
    // Front and back are separate, so the fabric shows at both flanks.
    const cuirass = new THREE.Group()
    cuirass.position.y = 0.52
    cuirass.scale.z = 0.74
    body.add(cuirass)

    ;[
      [FRONT, Math.PI * 0.8],
      [BACK, Math.PI * 0.62],
    ].forEach(([center, sweep]) => {
      const chest = plate(0.42, 0.435, 0.2, arc(center, sweep), mats.red, 0.03)
      chest.position.y = 0.16
      cuirass.add(chest)

      const rim = plate(0.43, 0.43, 0.022, arc(center, sweep), mats.gold, 0.04)
      rim.position.y = 0.265
      cuirass.add(rim)

      lamellar(cuirass, {
        rows: 3,
        rowH: 0.085,
        gap: 0.022,
        rTop: 0.44,
        flare: 0.07,
        span: arc(center, sweep + 0.06),
        y: 0.038,
        material: [mats.red, mats.red, mats.redDark],
        hang: 0.05,
        cordsPer: center === FRONT ? 5 : 4,
      })
    })

    ;[-0.3, 0.3].forEach((x) => {
      stud(cuirass, x, 0.21, Math.sqrt(0.432 ** 2 - x * x) + 0.004, Math.asin(x / 0.432))
    })

    // Chest device: a simple geometric mark on a gold disc
    const monPlate = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 40), mats.gold)
    monPlate.position.set(0, 0.16, 0.445)
    monPlate.rotation.x = Math.PI / 2
    cuirass.add(monPlate)

    const monRing = mesh(new THREE.TorusGeometry(0.066, 0.014, 10, 36), mats.metalDark)
    monRing.position.set(0, 0.16, 0.462)
    cuirass.add(monRing)

    // Watagami: cord shoulder straps tying the dō on
    ;[-1, 1].forEach((side) => {
      const strap = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), mats.rope)
      strap.position.set(side * 0.24, 0.82, 0.22)
      strap.rotation.z = side * 0.25
      body.add(strap)
    })

    // Obi sash, with a knot on the left hip
    const sash = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 40), mats.cloth)
    sash.position.y = 0.1
    sash.scale.z = 0.74
    body.add(sash)

    const sashKnot = mesh(new RoundedBoxGeometry(0.2, 0.18, 0.15, 4, 0.05), mats.cloth)
    sashKnot.position.set(-0.3, 0.08, 0.32)
    sashKnot.rotation.z = 0.4
    body.add(sashKnot)

    const sashTail = mesh(new RoundedBoxGeometry(0.1, 0.3, 0.06, 4, 0.03), mats.cloth)
    sashTail.position.set(-0.36, -0.12, 0.3)
    sashTail.rotation.z = 0.2
    body.add(sashTail)

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
        rows: 3,
        rowH: 0.1,
        gap: 0.024,
        rTop: SKIRT_R,
        flare: 0.24,
        span: arc(center, Math.PI * 0.25),
        y: 0.01,
        material: mats.red,
        trim: mats.gold,
        hang: 0.07,
        cordsPer: 2,
      })
      // Front panels rest on the thighs; the rest fan out on the floor.
      panels.push({ flap, spread: Math.cos(center) > 0.4 ? 1.3 : 1.12 })
    }

    /* ================================================================
       Shoulders and arms — laced sode over fabric sleeves
       ================================================================ */
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.46, 0.72, 0)
      body.add(shoulder)

      const cord = mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 24), mats.rope)
      cord.position.set(side * 0.02, 0.1, 0)
      cord.rotation.x = Math.PI / 2
      shoulder.add(cord)

      const capKnot = mesh(new THREE.SphereGeometry(0.045, 12, 8), mats.rope)
      capKnot.position.set(side * 0.02, 0.12, 0)
      shoulder.add(capKnot)

      // Sode: four lames draped over the outside of the shoulder
      const outward = side > 0 ? RIGHT : LEFT
      const sode = lamellar(shoulder, {
        rows: 4,
        rowH: 0.085,
        gap: 0.024,
        rTop: 0.24,
        flare: 0.16,
        span: arc(outward, Math.PI * 0.86),
        y: 0.065,
        material: [mats.red, mats.red, mats.redDark, mats.red],
        trim: mats.gold,
        hang: 0.04,
        cordsPer: 3,
      })
      sode.rotation.z = side * -0.12

      const upper = mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.34, 20), mats.fabric)
      upper.position.y = -0.36
      shoulder.add(upper)

      const elbow = new THREE.Group()
      elbow.position.y = -0.56
      shoulder.add(elbow)

      const fore = mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.36, 20), mats.fabric)
      fore.position.y = -0.18
      elbow.add(fore)

      // Kote: two lacquered splints on the outside of the forearm
      ;[-1, 1].forEach((k) => {
        const splint = plate(0.126, 0.13, 0.24, arc(outward + k * 0.36, 0.56), mats.red, 0.02)
        splint.position.y = -0.18
        elbow.add(splint)
      })

      const koteTrim = plate(0.134, 0.135, 0.024, arc(outward, Math.PI * 0.86), mats.gold, 0.014)
      koteTrim.position.y = -0.05
      elbow.add(koteTrim)

      stud(elbow, Math.sin(outward) * 0.138, -0.18, 0, outward)

      // Tekko: an iron plate over the back of the gloved hand
      const hand = mesh(new THREE.SphereGeometry(0.12, 24, 16), mats.leather)
      hand.position.y = -0.4
      hand.scale.set(1, 1.15, 0.92)
      elbow.add(hand)

      const tekko = plate(0.13, 0.12, 0.12, arc(outward, Math.PI * 0.7), mats.metal, 0.018)
      tekko.position.y = -0.38
      elbow.add(tekko)

      return { shoulder, elbow, side }
    })

    /* ================================================================
       Head — a dark iron menpō with subtly lit eyes
       ================================================================ */
    const headRig = new THREE.Group()
    headRig.position.y = HEAD_Y
    samurai.add(headRig)

    const face = mesh(new THREE.SphereGeometry(0.46, 40, 28), mats.face)
    face.scale.set(1.0, 0.92, 0.94)
    headRig.add(face)

    ;[-1, 1].forEach((side) => {
      const cheek = mesh(new RoundedBoxGeometry(0.15, 0.28, 0.18, 4, 0.06), mats.metal)
      cheek.position.set(side * 0.34, -0.08, 0.2)
      cheek.rotation.y = side * -0.4
      headRig.add(cheek)
    })

    const brow = mesh(new RoundedBoxGeometry(0.68, 0.08, 0.16, 4, 0.03), mats.metalDark)
    brow.position.set(0, 0.26, 0.36)
    headRig.add(brow)

    const recess = mesh(new RoundedBoxGeometry(0.72, 0.22, 0.1, 4, 0.04), mats.metalDark)
    recess.position.set(0, 0.09, 0.39)
    headRig.add(recess)

    // Long, nearly level slits: focused rather than angry
    const eyeGeo = track(new RoundedBoxGeometry(0.25, 0.06, 0.05, 3, 0.017))
    const eyes = [-0.175, 0.175].map((x) => {
      const eye = new THREE.Mesh(eyeGeo, mats.eye)
      eye.position.set(x, 0.1, 0.45)
      eye.rotation.z = x < 0 ? -0.08 : 0.08
      headRig.add(eye)
      return eye
    })

    const nose = mesh(new THREE.ConeGeometry(0.08, 0.17, 6), mats.metal)
    nose.position.set(0, -0.03, 0.41)
    nose.rotation.x = -0.4
    nose.scale.x = 0.85
    headRig.add(nose)

    const guard = mesh(new RoundedBoxGeometry(0.52, 0.24, 0.28, 4, 0.08), mats.metalDark)
    guard.position.set(0, -0.19, 0.26)
    headRig.add(guard)

    const vent = new RoundedBoxGeometry(0.3, 0.024, 0.032, 3, 0.01)
    headRig.add(
      mesh(
        mergeCopies(
          vent,
          [0, 1, 2].map((i) => new THREE.Matrix4().makeTranslation(0, -0.1 - i * 0.052, 0.4))
        ),
        mats.metal
      )
    )
    vent.dispose()

    const chin = mesh(new THREE.ConeGeometry(0.17, 0.19, 8), mats.metalDark)
    chin.position.set(0, -0.31, 0.21)
    chin.rotation.x = Math.PI
    headRig.add(chin)

    const scarf = mesh(new THREE.TorusGeometry(0.34, 0.1, 16, 48), mats.cloth)
    scarf.position.y = -0.4
    scarf.rotation.x = Math.PI / 2
    headRig.add(scarf)

    const tails = [0.1, -0.06].map((x, i) => {
      const tail = mesh(new RoundedBoxGeometry(0.13, 0.38, 0.07, 4, 0.035), mats.cloth)
      tail.position.set(x, -0.7 - i * 0.05, 0.27 - i * 0.05)
      tail.rotation.z = 0.2 - i * 0.35
      headRig.add(tail)
      return tail
    })

    /* ================================================================
       Kabuto — ridged bowl, visor, laced shikoro, gold horns
       ================================================================ */
    const helmet = new THREE.Group()
    helmet.position.y = 0.14
    headRig.add(helmet)

    const bowlRig = new THREE.Group()
    bowlRig.position.y = 0.16
    bowlRig.scale.y = 1.12
    helmet.add(bowlRig)

    const bowl = mesh(
      new THREE.SphereGeometry(0.6, 64, 24, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.bowl
    )
    bowlRig.add(bowl)

    // Suji-bachi: the bowl is riveted from plates, each seam a raised ridge
    const ribCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 9 }, (_, i) => {
        const phi = 0.17 + (i / 8) * (Math.PI / 2 - 0.19)
        return new THREE.Vector3(Math.sin(phi) * 0.598, Math.cos(phi) * 0.598, 0)
      })
    )
    const rib = taperTube(new THREE.TubeGeometry(ribCurve, 24, 0.012, 6), ribCurve, 24, 6, (t) =>
      0.55 + t * 0.45
    )
    const RIBS = 16
    bowlRig.add(
      mesh(
        mergeCopies(
          rib,
          Array.from({ length: RIBS }, (_, i) =>
            new THREE.Matrix4().makeRotationY((i / RIBS) * Math.PI * 2)
          )
        ),
        mats.bowl
      )
    )
    rib.dispose()

    // Koshimaki: the iron band around the base, with a row of gold rivets
    const band = plate(0.615, 0.615, 0.06, [0, Math.PI * 2], mats.metalDark, 0.03, 64)
    band.position.y = 0.19
    helmet.add(band)

    const rivet = new THREE.SphereGeometry(0.016, 10, 6)
    const RIVETS = 24
    helmet.add(
      mesh(
        mergeCopies(
          rivet,
          Array.from({ length: RIVETS }, (_, i) => {
            const a = (i / RIVETS) * Math.PI * 2
            return new THREE.Matrix4().makeTranslation(
              Math.sin(a) * 0.622,
              0.19,
              Math.cos(a) * 0.622
            )
          })
        ),
        mats.gold
      )
    )
    rivet.dispose()

    const tehen = mesh(new THREE.TorusGeometry(0.09, 0.028, 16, 40), mats.gold)
    tehen.position.y = 0.66
    tehen.rotation.x = Math.PI / 2
    helmet.add(tehen)

    // Mabisashi: a front visor rather than a full brim
    const visorRig = new THREE.Group()
    visorRig.position.set(0, 0.26, 0.02)
    visorRig.rotation.x = -0.32
    helmet.add(visorRig)

    const visor = plate(0.8, 0.62, 0.12, arc(FRONT, Math.PI * 1.05), mats.redDark, 0.024, 28)
    visorRig.add(visor)

    // Gold binding along the visor's outer rim
    const visorEdge = plate(0.812, 0.8, 0.024, arc(FRONT, Math.PI * 1.05), mats.gold, 0.036, 28)
    visorEdge.position.y = 0.06
    visorRig.add(visorEdge)

    // Shikoro: three laced lames guarding the back of the neck
    const shikoro = lamellar(helmet, {
      rows: 3,
      rowH: 0.1,
      gap: 0.032,
      rTop: 0.625,
      flare: 0.34,
      span: arc(BACK, Math.PI * 1.44),
      y: 0.13,
      material: [mats.red, mats.redDark, mats.red],
      trim: mats.gold,
      cordsPer: 8,
    })
    shikoro.position.z = -0.08
    shikoro.rotation.x = 0.22

    // Fukigaeshi: small swept wings beside the visor, edged in gold
    ;[-1, 1].forEach((side) => {
      const span = arc(side > 0 ? RIGHT : LEFT, Math.PI * 0.7)
      const wingRig = new THREE.Group()
      wingRig.position.set(side * 0.62, 0.3, 0.1)
      wingRig.rotation.set(0.1, 0, side * 0.3)
      helmet.add(wingRig)

      wingRig.add(plate(0.2, 0.22, 0.28, span, mats.red, 0.024))

      const wingEdge = plate(0.2185, 0.22, 0.024, span, mats.gold, 0.034)
      wingEdge.position.y = -0.128
      wingRig.add(wingEdge)
    })

    // Maedate: two elegant gold horns, tapering to a point
    const crest = new THREE.Group()
    crest.position.set(0, 0.5, 0.12)
    helmet.add(crest)

    const hornPath = (dir) =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(dir * 0.05, 0, 0),
        new THREE.Vector3(dir * 0.34, 0.14, 0),
        new THREE.Vector3(dir * 0.58, 0.42, 0),
        new THREE.Vector3(dir * 0.64, 0.78, 0),
        new THREE.Vector3(dir * 0.54, 1.02, 0),
        new THREE.Vector3(dir * 0.42, 1.12, 0),
      ])

    ;[-1, 1].forEach((dir) => {
      const path = hornPath(dir)
      const taper = (t) => 1.1 - t * 0.72
      const horn = mesh(
        taperTube(new THREE.TubeGeometry(path, 64, 0.078, 16, false), path, 64, 16, taper),
        mats.gold
      )
      horn.scale.z = 0.55
      crest.add(horn)

      const tip = mesh(new THREE.SphereGeometry(0.078 * taper(1), 12, 8), mats.gold)
      tip.position.copy(path.getPointAt(1))
      tip.scale.z = 0.55
      crest.add(tip)
    })

    const crestBase = mesh(new RoundedBoxGeometry(0.34, 0.15, 0.12, 4, 0.045), mats.gold)
    crestBase.position.y = -0.02
    crest.add(crestBase)

    /* ================================================================
       Katana — held low in the right hand
       ================================================================ */
    const katana = new THREE.Group()
    arms[1].elbow.add(katana)
    katana.position.set(0.02, -0.4, 0.04)

    // Tsuka: white ray skin under a crossed black silk wrap
    const core = mesh(new RoundedBoxGeometry(0.086, 0.5, 0.072, 3, 0.03), mats.bowl)
    core.position.y = -0.12
    katana.add(core)

    const wrap = new RoundedBoxGeometry(0.108, 0.024, 0.018, 2, 0.008)
    const wrapMatrices = []
    for (let i = 0; i < 6; i++) {
      for (const z of [0.038, -0.038]) {
        for (const tilt of [0.6, -0.6]) {
          wrapMatrices.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(0, 0.09 - i * 0.07, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)),
              new THREE.Vector3(1, 1, 1)
            )
          )
        }
      }
    }
    katana.add(mesh(mergeCopies(wrap, wrapMatrices), mats.fabric))
    wrap.dispose()

    const menuki = mesh(new THREE.OctahedronGeometry(0.035, 1), mats.gold)
    menuki.position.set(0, -0.13, 0.046)
    menuki.scale.set(1, 1.4, 0.4)
    katana.add(menuki)

    const kashira = mesh(new RoundedBoxGeometry(0.1, 0.06, 0.086, 3, 0.025), mats.metalDark)
    kashira.position.y = -0.39
    katana.add(kashira)

    const fuchi = mesh(new RoundedBoxGeometry(0.098, 0.04, 0.084, 3, 0.015), mats.gold)
    fuchi.position.y = 0.13
    katana.add(fuchi)

    const tsuba = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.034, 48), mats.metalDark)
    tsuba.position.y = 0.165
    katana.add(tsuba)

    const tsubaRim = mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 48), mats.gold)
    tsubaRim.position.y = 0.165
    tsubaRim.rotation.x = Math.PI / 2
    katana.add(tsubaRim)

    const habaki = mesh(new RoundedBoxGeometry(0.09, 0.07, 0.04, 3, 0.015), mats.gold)
    habaki.position.y = 0.215
    katana.add(habaki)

    const blade = mesh(bladeGeometry(1.26), mats.steel)
    blade.position.y = 0.19
    katana.add(blade)

    /* ================================================================
       Ground — shadow map plus a painted contact pool
       ================================================================ */
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 })
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(22, 22)), shadowMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const poolCanvas = document.createElement('canvas')
    poolCanvas.width = poolCanvas.height = 128
    const pctx = poolCanvas.getContext('2d')
    const grad = pctx.createRadialGradient(64, 64, 2, 64, 64, 62)
    grad.addColorStop(0, 'rgba(0,0,0,0.5)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.2)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    pctx.fillStyle = grad
    pctx.fillRect(0, 0, 128, 128)

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
       Actions — meditate and stand up
       ================================================================ */
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // `w` runs 0 (standing) → 1 (seated in meditation).
    const pose = { w: 0, from: 0, to: 0, start: -TRANSITION, next: FIRST_SIT_AT }
    let now = 0

    const toggleMeditation = () => {
      pose.from = pose.w
      pose.to = pose.to ? 0 : 1
      pose.start = now
      pose.next = now + TRANSITION + (pose.to ? MEDITATE_FOR : STAND_FOR)
    }

    // Standing, the blade hangs down and out; seated, it lies across the lap
    // (blade toward his left, edge up). The lap pose is held in body space and
    // converted into the moving hand's frame every frame.
    const katanaStand = new THREE.Quaternion()
    const katanaLap = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.12, Math.PI / 2))
    const handQ = new THREE.Quaternion()
    const rootQ = new THREE.Quaternion()
    const lapLocal = new THREE.Quaternion()
    const standEuler = new THREE.Euler()

    /* ---- Cursor tracking ---- */
    const look = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    const onPointerMove = (e) => {
      if (interacting) return
      const rect = mount.getBoundingClientRect()
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    const onPointerLeave = () => {
      target.x = 0
      target.y = 0
    }

    // A tap or click — not a drag — toggles meditation.
    let press = null
    const onPointerDown = (e) => {
      press = { x: e.clientX, y: e.clientY, t: performance.now() }
    }
    const onPointerUp = (e) => {
      if (!press) return
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      if (moved < 6 && performance.now() - press.t < 450) toggleMeditation()
      press = null
    }
    const onKeyDown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      toggleMeditation()
    }
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)
    mount.addEventListener('pointerdown', onPointerDown)
    mount.addEventListener('pointerup', onPointerUp)
    mount.addEventListener('keydown', onKeyDown)

    /* ---- Ambient occlusion: desktop only, switched on after first paint ---- */
    let composer = null
    let aoParts = null
    const enableAO = async () => {
      const aoTarget = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: 4,
      })
      const c = new EffectComposer(renderer, aoTarget)
      c.setPixelRatio(dpr)
      c.setSize(mount.clientWidth, mount.clientHeight)
      c.addPass(new RenderPass(scene, camera))
      const gtao = new GTAOPass(scene, camera, mount.clientWidth, mount.clientHeight)
      gtao.updateGtaoMaterial({
        radius: 0.3,
        distanceExponent: 1,
        thickness: 1,
        scale: 3,
        samples: 16,
      })
      gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 })
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

    /* ---- Animation: a relaxed idle, and the meditation cycle ---- */
    const clock = new THREE.Clock()
    let frame = null
    let started = false

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!started || !gate.visible) return

      clock.getDelta()
      const t = (now = clock.elapsedTime)

      if (!reducedMotion && t >= pose.next) toggleMeditation()
      const k = THREE.MathUtils.clamp((t - pose.start) / TRANSITION, 0, 1)
      const w = (pose.w = lerp(pose.from, pose.to, smootherstep(k)))
      const stand = 1 - w
      // Peaks mid-transition: he leans into the motion of sitting or rising.
      const effort = Math.sin(Math.PI * k) * Math.abs(pose.to - pose.from)

      samurai.position.y = -SIT_DROP * w + Math.sin(t * 1.1) * 0.022 * stand
      samurai.rotation.z = Math.sin(t * 0.5) * 0.01 * stand
      body.rotation.y = Math.sin(t * 0.42) * 0.045 * stand
      body.rotation.x = 0.04 * w + effort * 0.22

      // Breathing: shallow while standing, slow and deep in meditation
      const breath = Math.sin(t * 1.0)
      torso.scale.set(1, 1 + Math.sin(t * 1.45) * 0.012 * stand + breath * 0.028 * w, 1)
      skirt.rotation.y = Math.sin(t * 0.42) * 0.03 * stand
      panels.forEach(({ flap, spread }) => {
        flap.rotation.x = -spread * w
      })

      tails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(t * 1.2 + i * 0.8) * 0.1 * stand + 0.35 * w
      })

      look.x += (target.x - look.x) * 0.05
      look.y += (target.y - look.y) * 0.05
      headRig.rotation.y = (look.x * 0.34 + Math.sin(t * 0.33) * 0.03) * stand
      headRig.rotation.x = look.y * 0.14 * stand + (0.2 + breath * 0.025) * w
      headRig.rotation.z = Math.sin(t * 0.47) * 0.016 * stand

      // Eyes narrow to slits in meditation and glow with each breath
      mats.eye.emissiveIntensity = lerp(
        0.78 + Math.sin(t * 0.85) * 0.1,
        0.45 + breath * 0.3,
        w
      )
      eyes.forEach((eye, i) => {
        eye.scale.y = lerp(1 + Math.sin(t * 0.85 + i) * 0.03, 0.3, w)
      })

      // Arms hang and sway; seated, the hands come to rest on the lap
      arms.forEach(({ shoulder, elbow, side }) => {
        const idle = Math.sin(t * 1.05 + side) * 0.035 * stand
        shoulder.rotation.z = side * lerp(0.16, 0.3, w) + idle * 0.5
        shoulder.rotation.x = idle - 0.52 * w
        elbow.rotation.x = -0.1 + idle * 0.4 - 1.05 * w
        elbow.rotation.z = side * -0.35 * w
      })

      // Cross-legged: thighs lift forward and splay out, shins fold inward
      legs.forEach(({ hip, knee, side }) => {
        const sway = Math.sin(t * 0.5 + side * 1.6) * 0.012 * stand
        hip.rotation.set(sway - 1.42 * w, side * lerp(0.1, 0.8, w), side * 0.05 * stand)
        knee.rotation.set(side * 0.1 * w, 0, -side * 2.5 * w)
      })

      // Sitting lowers his head, so the camera's aim follows him down
      const aimY = lerp(STAND_TARGET_Y, SIT_TARGET_Y, w)
      camera.position.y += aimY - controls.target.y
      controls.target.y = aimY

      standEuler.set(KATANA_TILT + Math.sin(t * 0.9) * 0.03 * stand, 0, Math.PI + 0.58)
      katanaStand.setFromEuler(standEuler)
      // The blade swings onto the lap during the first half of sitting (and
      // leaves it late when rising), so it never dips through the floor.
      const kw = THREE.MathUtils.smoothstep(w, 0, 0.55)
      if (kw > 0) {
        samurai.updateMatrixWorld(true)
        arms[1].elbow.getWorldQuaternion(handQ)
        samurai.getWorldQuaternion(rootQ)
        // hand orientation relative to the body, inverted, then the lap pose
        lapLocal.copy(rootQ.invert()).multiply(handQ).invert().multiply(katanaLap)
        katana.quaternion.slerpQuaternions(katanaStand, lapLocal, kw)
      } else {
        katana.quaternion.copy(katanaStand)
      }

      controls.update()
      if (composer) composer.render()
      else renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    // Compile every shader in parallel (without blocking the page), then
    // start drawing and fade the canvas in. AO follows once the page is idle.
    const start = async () => {
      envTexture = await bakedEnv
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
      if (window.matchMedia('(pointer: fine)').matches) {
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
      mats.metal.color.copy(cssColor('--samurai-armor', '#39414f'))
      mats.metalDark.color.copy(cssColor('--samurai-armor-dark', '#22272f'))
      mats.gold.color.copy(cssColor('--samurai-gold', '#e0a63a'))
      mats.rope.color.copy(cssColor('--samurai-rope', '#b8935a'))
      mats.bowl.color.copy(cssColor('--samurai-bowl', '#e8e1d4'))
      mats.steel.color.copy(cssColor('--samurai-steel', '#e9edf4'))
      mats.cloth.color.copy(cssColor('--samurai-cloth', '#a8322a'))
      mats.leather.color.copy(cssColor('--samurai-leather', '#4a3b33'))
      mats.face.color.copy(cssColor('--samurai-face', '#2f3642'))
      const eye = cssColor('--samurai-eye', '#ffb347')
      mats.eye.color.copy(eye)
      mats.eye.emissive.copy(eye)
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
      gate.dispose()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)
      mount.removeEventListener('pointerdown', onPointerDown)
      mount.removeEventListener('pointerup', onPointerUp)
      mount.removeEventListener('keydown', onKeyDown)
      mount.classList.remove('is-ready')
      controls.dispose()

      geos.forEach((g) => g.dispose())
      geos.clear()
      allMats.forEach((m) => m.dispose())
      Object.values(maps).forEach((t) => t.dispose())
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
    <div
      className="robot3d samurai3d"
      ref={mountRef}
      role="button"
      tabIndex={0}
      aria-label="3D samurai. Drag to turn him; click, tap or press Enter to meditate or stand up."
    />
  )
}
