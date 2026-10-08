import * as THREE from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Geometry builders for the samurai's armour, cloth and katana. Everything
 * here is pure: it takes measurements and returns a BufferGeometry.
 */

const clamp = THREE.MathUtils.clamp

// Partial-cylinder helpers. three.js starts theta at +Z (the front) and
// sweeps toward +X, so each arc is described by the angle it centres on.
export const arc = (center, sweep) => [center - sweep / 2, sweep]
export const FRONT = 0
export const BACK = Math.PI
export const RIGHT = Math.PI / 2
export const LEFT = -Math.PI / 2

// Extruded geometry gets UVs in world units; plates are a fraction of a unit,
// so this brings their texel density in line with the primitive geometries.
export const UV_SCALE = 3

// Lames carry one row of kozane scales each; eight scales span this width.
export const KOZANE_TILE = 0.28

/** Smooth 1D value noise, for patchy edge wear along a plate. */
export function wearNoise(x) {
  const i = Math.floor(x)
  const f = x - i
  const h = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return v - Math.floor(v)
  }
  return h(i) + (h(i + 1) - h(i)) * f * f * (3 - 2 * f)
}

/** Pushes cloth-like folds into a cylinder: bunched rings and soft creases. */
export function foldCloth(geo, height, { rings = [], creases = 0.03, seed = 1 } = {}) {
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

/**
 * Hakama cloth: knife pleats round a cylinder — each pleat rises gently and
 * folds under sharply — pressed flat at the waist and opening toward the
 * hem, then foldCloth's bunching and creases on top. `pleats` must be a
 * whole number, so the cloth meets itself at the seam.
 */
export function pleatCloth(geo, height, { pleats = 10, depth = 0.05, seed = 1, rings = [], creases = 0.02 } = {}) {
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = v.y / height + 0.5
    const s = (Math.atan2(v.x, v.z) / (Math.PI * 2)) * pleats + seed * 0.37
    const p = s - Math.floor(s)
    const saw = p < 0.85 ? p / 0.85 : (1 - p) / 0.15
    const k = 1 + depth * (saw - 0.5) * (0.35 + 0.65 * (1 - t))
    pos.setXYZ(i, v.x * k, v.y, v.z * k)
  }
  return foldCloth(geo, height, { rings, creases, seed })
}

/**
 * Gives a cloth cylinder world-scale UVs: `density` pattern tiles per unit,
 * rounded to a whole number round the circumference so the weave meets
 * itself at the seam, and square in world space.
 */
export function clothUV(geo, radius, height, density) {
  const around = Math.max(1, Math.round(2 * Math.PI * radius * density))
  const up = (height * around) / (2 * Math.PI * radius)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * up)
  return geo
}

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
 * the part is baked. The outer radius runs linearly from bottom to top, or
 * follows `profile(t)` (t = 0 at the bottom, 1 at the top) so a plate can
 * hug a curved surface such as the face.
 */
export function shellGeometry(
  rTop,
  rBottom,
  height,
  [start, sweep],
  thickness,
  segs,
  uvMode = 'world',
  bevelSegments = 4,
  profile = null
) {
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
    bevelSegments,
    curveSegments: 1,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getY(i) / height + 0.5, 0, 1)
    const k = (profile ? profile(t) : rBottom + (rTop - rBottom) * t) / r
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

  return creaseAndWeld(geo, 0.9)
}

/** Shrinks a tube toward its end — horns and ribs taper, they aren't pipes. */
export function taperTube(geo, curve, tubular, radial, taper) {
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

/**
 * Re-indexes a non-indexed geometry, sharing every vertex whose attributes
 * are bitwise identical. Baking turns every part non-indexed (to merge it),
 * which leaves each vertex repeated for every triangle that uses it — about
 * four copies each here — so the GPU would transform it four times per pass.
 * Only exact duplicates are merged, so the picture does not change at all.
 * Returns the input untouched if it is indexed or has non-32-bit attributes.
 */
export function weldExact(geo) {
  if (geo.index) return geo
  const names = Object.keys(geo.attributes)
  const attrs = names.map((n) => geo.attributes[n])
  if (attrs.some((a) => a.isInterleavedBufferAttribute || a.array.BYTES_PER_ELEMENT !== 4)) return geo
  const count = geo.attributes.position.count
  // Every vertex's attribute bits side by side, so hashing and comparing
  // run over one flat array.
  const K = attrs.reduce((sum, a) => sum + a.itemSize, 0)
  const key = new Uint32Array(count * K)
  let offset = 0
  for (const a of attrs) {
    const b = new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length)
    const n = a.itemSize
    for (let i = 0; i < count; i++) for (let c = 0; c < n; c++) key[i * K + offset + c] = b[i * n + c]
    offset += n
  }

  const index = new Uint32Array(count)
  const source = new Uint32Array(count) // unique vertex → the first vertex it came from
  let unique = 0
  // Open addressing: each slot holds a unique vertex + 1 (0 = empty).
  const mask = (1 << Math.ceil(Math.log2(count * 2 + 1))) - 1
  const slots = new Int32Array(mask + 1)
  for (let i = 0; i < count; i++) {
    const at = i * K
    let h = 2166136261
    for (let c = 0; c < K; c++) h = Math.imul(h ^ key[at + c], 16777619)
    let slot = h & mask
    let found = -1
    for (;;) {
      const u = slots[slot] - 1
      if (u < 0) break
      const other = source[u] * K
      let c = 0
      while (c < K && key[other + c] === key[at + c]) c++
      if (c === K) {
        found = u
        break
      }
      slot = (slot + 1) & mask
    }
    if (found < 0) {
      found = unique++
      source[found] = i
      slots[slot] = found + 1
    }
    index[i] = found
  }
  if (unique === count) return geo

  const out = new THREE.BufferGeometry()
  attrs.forEach((a, k) => {
    const n = a.itemSize
    const src = a.array
    const dst = new src.constructor(unique * n)
    for (let u = 0; u < unique; u++) {
      const from = source[u] * n
      for (let c = 0; c < n; c++) dst[u * n + c] = src[from + c]
    }
    out.setAttribute(names[k], new THREE.BufferAttribute(dst, n, a.normalized))
  })
  out.setIndex(new THREE.BufferAttribute(unique > 65535 ? index : new Uint16Array(index), 1))
  for (const g of geo.groups) out.addGroup(g.start, g.count, g.materialIndex)
  return out
}

/**
 * Hard edges where faces meet at more than `angle` (radians), smooth
 * elsewhere — then the vertices shared again (creasing splits them all).
 */
function creaseAndWeld(geo, angle) {
  const creased = toCreasedNormals(geo, angle)
  if (creased !== geo) geo.dispose()
  const welded = weldExact(creased)
  if (welded !== creased) creased.dispose()
  return welded
}

/** An indexed copy of `geo`: exact duplicates shared, else a plain 0..n index. */
export function indexedCopy(geo) {
  if (geo.index) return geo.clone()
  const welded = weldExact(geo)
  if (welded !== geo) return welded
  const copy = geo.clone()
  const n = copy.attributes.position.count
  copy.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(n).map((_, i) => i) : new Uint16Array(n).map((_, i) => i), 1))
  return copy
}

/** Bakes copies of `base` at each matrix into a single geometry. */
export function mergeCopies(base, matrices) {
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
export function bladeGeometry(length) {
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
  return creaseAndWeld(geo, 0.7)
}

/**
 * The maedate: two broad blades rising from the centre and sweeping out to
 * points, cut from one flat plate with softened edges. Crest space: the boss
 * sits at the origin, the plate faces +Z, and the blade tips reach ±0.86.
 */
export function crestGeometry() {
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
    bevelSegments: 3,
    curveSegments: 8,
  })
  geo.translate(0, 0, -0.013)
  return creaseAndWeld(geo, 0.6)
}

/** A sunburst of broad pointed rays, long and short by turns, as a thin gilt plate. */
export function sunburstGeometry() {
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
  return creaseAndWeld(geo, 0.6)
}

/** A round tsuba pierced with four sukashi openings. */
export function tsubaGeometry(radius, depth) {
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
  return creaseAndWeld(geo, 0.8)
}

/**
 * A thin strip laid over a sphere's surface along a meridian (the XY plane,
 * from polar angle phi0 down to phi1), `w0` wide at the top tapering to
 * `w1`, standing `lift` off the surface with real thickness. Each face is
 * smooth along the curve and creased against its neighbours.
 */
export function meridianStrip(R, phi0, phi1, w0, w1, lift = 0.003, thick = 0.004, segs = 20) {
  const position = []
  const uv = []
  const index = []
  const rIn = R + lift
  const rOut = rIn + thick
  // Four faces, each its own vertex strip: top, bottom, and the two sides.
  const faces = [
    [rOut, -1, rOut, 1],
    [rIn, 1, rIn, -1],
    [rIn, -1, rOut, -1],
    [rOut, 1, rIn, 1],
  ]
  for (const [rA, sA, rB, sB] of faces) {
    const base = position.length / 3
    for (let k = 0; k <= segs; k++) {
      const t = k / segs
      const phi = phi0 + (phi1 - phi0) * t
      const w = (w0 + (w1 - w0) * t) / 2
      position.push(rA * Math.sin(phi), rA * Math.cos(phi), sA * w)
      position.push(rB * Math.sin(phi), rB * Math.cos(phi), sB * w)
      uv.push(t * (phi1 - phi0) * R * UV_SCALE, 0, t * (phi1 - phi0) * R * UV_SCALE, w * 2 * UV_SCALE)
      if (k < segs) {
        const i = base + k * 2
        index.push(i, i + 2, i + 1, i + 1, i + 2, i + 3)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}
