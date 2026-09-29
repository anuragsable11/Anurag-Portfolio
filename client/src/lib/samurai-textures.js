/**
 * Procedural surface maps for the samurai.
 *
 * Every map is generated as raw RGBA pixels with plain arithmetic — no
 * canvas, no DOM — so the whole set can be built in a worker, off the main
 * thread (see samurai-textures.worker.js), and handed back as transferable
 * buffers. All maps tile seamlessly and are seeded, so the wear is identical
 * on every load.
 *
 * Heights become tangent-space normal maps (OpenGL convention, rows running
 * up the texture, as three.js DataTextures are not flipped). Roughness maps
 * are grey and multiply the material's roughness; colour maps are grey and
 * multiply its colour.
 *
 *   quality 'high' — 512 px detail maps (desktop)
 *   quality 'low'  — 256 px (phones and small screens)
 */

/* ================================================================
   Primitives
   ================================================================ */

export function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (t) => t * t * (3 - 2 * t)
const wrap = (v, n) => ((v % n) + n) % n

/**
 * Tileable value noise, 0..1, summed over octaves of [cellsX, weight, cellsY?].
 * Cells default to square; give cellsY to stretch the noise into grain.
 */
function noise(w, h, rand, octaves) {
  const out = new Float32Array(w * h)
  let total = 0
  for (const [cx, weight, cyGiven] of octaves) {
    const cy = cyGiven || Math.max(1, Math.round((cx * h) / w))
    const grid = new Float32Array(cx * cy)
    for (let i = 0; i < grid.length; i++) grid[i] = rand()
    for (let y = 0; y < h; y++) {
      const gy = (y / h) * cy
      const y0 = Math.floor(gy)
      const sy = smooth(gy - y0)
      const r0 = (y0 % cy) * cx
      const r1 = ((y0 + 1) % cy) * cx
      for (let x = 0; x < w; x++) {
        const gx = (x / w) * cx
        const x0 = Math.floor(gx)
        const sx = smooth(gx - x0)
        const c0 = x0 % cx
        const c1 = (x0 + 1) % cx
        const top = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx
        const bot = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx
        out[y * w + x] += (top + (bot - top) * sy) * weight
      }
    }
    total += weight
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

/**
 * Cuts fine grooves into a height field (negative depth raises ridges).
 * Each scratch fades in and out along its length, as real ones do.
 */
function scratches(field, w, h, rand, { count, len: [l0, l1], width, depth, angle }) {
  for (let n = 0; n < count; n++) {
    const x0 = rand() * w
    const y0 = rand() * h
    const a = angle ? angle[0] + rand() * (angle[1] - angle[0]) : rand() * Math.PI
    const len = l0 + rand() * (l1 - l0)
    const d = depth * (0.4 + 0.6 * rand())
    const wd = width * (0.6 + 0.8 * rand())
    const dx = Math.cos(a) * len
    const dy = Math.sin(a) * len
    const minX = Math.floor(Math.min(x0, x0 + dx) - wd - 1)
    const maxX = Math.ceil(Math.max(x0, x0 + dx) + wd + 1)
    const minY = Math.floor(Math.min(y0, y0 + dy) - wd - 1)
    const maxY = Math.ceil(Math.max(y0, y0 + dy) + wd + 1)
    const ll = len * len || 1
    for (let py = minY; py <= maxY; py++) {
      const row = wrap(py, h) * w
      for (let px = minX; px <= maxX; px++) {
        const t = Math.min(Math.max(((px - x0) * dx + (py - y0) * dy) / ll, 0), 1)
        const ex = px - (x0 + t * dx)
        const ey = py - (y0 + t * dy)
        const dist = Math.sqrt(ex * ex + ey * ey)
        if (dist >= wd) continue
        const f = 1 - dist / wd
        field[row + wrap(px, w)] -= d * f * f * Math.sqrt(Math.sin(Math.PI * t))
      }
    }
  }
}

/** Round dimples (hammer marks, dents, pits); negative depth makes bumps. */
function dimples(field, w, h, rand, { count, r: [r0, r1], depth }) {
  for (let n = 0; n < count; n++) {
    const cx = rand() * w
    const cy = rand() * h
    const r = r0 + rand() * (r1 - r0)
    const d = depth * (0.5 + 0.5 * rand())
    const rr = r * r
    for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++) {
      const row = wrap(py, h) * w
      for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
        const q = ((px - cx) ** 2 + (py - cy) ** 2) / rr
        if (q >= 1) continue
        field[row + wrap(px, w)] -= d * (1 - q) * (1 - q)
      }
    }
  }
}

/** Tileable Worley noise: distance to the nearest and second-nearest feature. */
function worley(w, h, rand, cells) {
  const pts = new Float32Array(cells * cells * 2)
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = rand()
    pts[i * 2 + 1] = rand()
  }
  const f1 = new Float32Array(w * h)
  const f2 = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const gy = (y / h) * cells
    const cy = Math.floor(gy)
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * cells
      const cx = Math.floor(gx)
      let d1 = 9
      let d2 = 9
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const i = wrap(cy + oy, cells) * cells + wrap(cx + ox, cells)
          const px = cx + ox + pts[i * 2]
          const py = cy + oy + pts[i * 2 + 1]
          const d = Math.hypot(px - gx, py - gy)
          if (d < d1) {
            d2 = d1
            d1 = d
          } else if (d < d2) d2 = d
        }
      }
      f1[y * w + x] = d1
      f2[y * w + x] = d2
    }
  }
  return { f1, f2 }
}

/** Height field → RGBA tangent-space normal map, sampling across the seams. */
function toNormal(field, w, h, strength) {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const up = wrap(y - 1, h) * w
    const dn = wrap(y + 1, h) * w
    const row = y * w
    for (let x = 0; x < w; x++) {
      const l = field[row + wrap(x - 1, w)]
      const r = field[row + wrap(x + 1, w)]
      const nx = (l - r) * strength
      const ny = (field[up + x] - field[dn + x]) * strength
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const i = (row + x) * 4
      out[i] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      out[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      out[i + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      out[i + 3] = 255
    }
  }
  return out
}

/** A 0..1 field → grey RGBA, remapped to [lo, hi]. */
function toGray(field, lo, hi) {
  const out = new Uint8Array(field.length * 4)
  for (let i = 0; i < field.length; i++) {
    const v = Math.round(clamp01(lo + field[i] * (hi - lo)) * 255)
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return out
}

function normalize(field) {
  let lo = Infinity
  let hi = -Infinity
  for (const v of field) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const k = 1 / (hi - lo || 1)
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) * k
  return field
}

const tex = (w, h, data) => ({ w, h, data })

/* ================================================================
   The maps
   ================================================================ */

/** Roughness variation for lacquer, leather and gold: patches, grain, scuffs. */
function grain(S) {
  const r = rng(11)
  const f = noise(S, S, r, [[6, 0.45], [24, 0.3], [96, 0.25]])
  // Scuffs are rougher than the polish around them.
  scratches(f, S, S, r, { count: Math.round(70 * (S / 256) ** 2), len: [6, 40], width: 1.1, depth: -0.35 })
  return tex(S, S, toGray(f, 0.72, 1))
}

/** Colour mottling: uneven lacquer, faint scratches, small chips. */
function mottle(S) {
  const r = rng(23)
  const f = noise(S, S, r, [[4, 0.5], [16, 0.3], [64, 0.2]])
  scratches(f, S, S, r, { count: Math.round(110 * (S / 512) ** 2), len: [8, 56], width: 0.9, depth: 0.1 })
  dimples(f, S, S, r, { count: Math.round(60 * (S / 512) ** 2), r: [0.8, 2.4], depth: 0.25 })
  return tex(S, S, toGray(f, 0.87, 1))
}

/** Lacquer over plate: orange peel, a few shallow dents, fine scratches. */
function lacquerN(S) {
  const r = rng(31)
  const k = S / 512
  const f = noise(S, S, r, [[96, 0.5], [192, 0.5]])
  for (let i = 0; i < f.length; i++) f[i] *= 0.18
  dimples(f, S, S, r, { count: Math.round(14 * k * k), r: [8 * k, 26 * k], depth: 0.8 })
  scratches(f, S, S, r, { count: Math.round(90 * k * k), len: [10 * k, 70 * k], width: 1.2, depth: 0.9 })
  return tex(S, S, toNormal(f, S, S, 2.2))
}

/**
 * Kozane: the laced rows are really built from small overlapping scales.
 * One texture row spans one lame (v 0 → 1, bottom → top): eight scales
 * across, each domed and lapping over its neighbour, with rounded tops that
 * leave little notches along the lame's upper edge.
 */
function kozaneN(S) {
  const r = rng(37)
  const k = S / 512
  const cols = 8
  const f = new Float32Array(S * S)
  const peel = noise(S, S, r, [[128, 1]])
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S
    for (let x = 0; x < S; x++) {
      const fx = ((x + 0.5) / S) * cols
      const t = fx - Math.floor(fx)
      const dome = 1 - (2 * t - 1) ** 2
      // Each scale rises toward its overlapping edge, then drops to the next.
      let hgt = 0.55 * dome + 0.3 * t
      const top = 0.97 - 0.13 * (1 - Math.sqrt(Math.max(0, dome)))
      hgt -= 1.1 * smooth(clamp01((v - (top - 0.025)) / 0.035))
      // The lame's lower edge rolls under slightly.
      hgt -= 0.4 * smooth(clamp01((0.06 - v) / 0.06))
      f[y * S + x] = hgt * 3 + peel[y * S + x] * 0.2
    }
  }
  scratches(f, S, S, r, { count: Math.round(60 * k * k), len: [8 * k, 50 * k], width: 1.1, depth: 0.9 })
  dimples(f, S, S, r, { count: Math.round(8 * k * k), r: [6 * k, 16 * k], depth: 0.6 })
  return tex(S, S, toNormal(f, S, S, 2.4 * k + 0.6))
}

/** Hammered iron: dense peen marks over a warped plate, dents, pits, scratches. */
function iron(S) {
  const r = rng(41)
  const k = S / 512
  const f = noise(S, S, r, [[3, 0.6], [8, 0.4]])
  for (let i = 0; i < f.length; i++) f[i] *= 6
  dimples(f, S, S, r, { count: Math.round(900 * k * k), r: [5 * k, 16 * k], depth: 0.9 })
  dimples(f, S, S, r, { count: Math.round(5 * k * k) + 2, r: [30 * k, 60 * k], depth: 3 })
  dimples(f, S, S, r, { count: Math.round(160 * k * k), r: [0.7, 1.2], depth: 0.25 })
  const scars = new Float32Array(S * S)
  scratches(scars, S, S, r, { count: Math.round(140 * k * k), len: [8 * k, 90 * k], width: 1, depth: 0.8 })
  scratches(scars, S, S, r, { count: Math.round(18 * k * k) + 3, len: [80 * k, 200 * k], width: 1.2, depth: 0.5 })
  for (let i = 0; i < f.length; i++) f[i] += scars[i]
  const normal = toNormal(f, S, S, 1.15)
  // Roughness: raised spots are rubbed smooth, scratches catch the light
  // differently, and the whole plate varies a little.
  const h = normalize(Float32Array.from(f))
  const var_ = noise(S, S, r, [[16, 0.6], [64, 0.4]])
  const rough = new Float32Array(S * S)
  for (let i = 0; i < rough.length; i++) rough[i] = 0.18 + 0.52 * (1 - h[i]) + 0.2 * var_[i] - scars[i] * 0.25
  return { ironN: tex(S, S, normal), ironR: tex(S, S, toGray(rough, 0.55, 1.05)) }
}

/** Twill-woven cotton: threads over two, under two, with fibres along them. */
function weaveN(S) {
  const r = rng(47)
  const n = 16
  const t = S / n
  const fibre = noise(S, S, r, [[S / 4, 0.5, S / 32], [S / 8, 0.5, S / 64]])
  const fibreY = noise(S, S, r, [[S / 32, 0.5, S / 4], [S / 64, 0.5, S / 8]])
  const f = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / t)
      const cy = Math.floor(y / t)
      const fx = x / t - cx
      const fy = y / t - cy
      const over = (cx + cy) % 4 < 2
      const i = y * S + x
      f[i] = over
        ? 0.6 + 0.4 * Math.sin(Math.PI * fx) + fibre[i] * 0.25
        : 0.35 * Math.sin(Math.PI * fy) + fibreY[i] * 0.25
    }
  }
  return tex(S, S, toNormal(f, S, S, 1.4))
}

/** Pebbled leather with creases and pores. */
function leatherN(S) {
  const r = rng(53)
  const k = S / 256
  const { f1, f2 } = worley(S, S, r, 22)
  const f = new Float32Array(S * S)
  for (let i = 0; i < f.length; i++) f[i] = smooth(clamp01((f2[i] - f1[i]) / 0.35)) * 1.2
  scratches(f, S, S, r, { count: Math.round(14 * k * k) + 2, len: [30 * k, 110 * k], width: 1.8, depth: 1.4 })
  dimples(f, S, S, r, { count: Math.round(300 * k * k), r: [0.6, 1.3], depth: 0.5 })
  return tex(S, S, toNormal(f, S, S, 1.8))
}

/** Flat silk braid: strands running in a chevron, each made of fibres. */
function braidN(S) {
  const r = rng(59)
  const fib = noise(S, S, r, [[S / 2, 0.6, S / 8], [S / 4, 0.4, S / 16]])
  const period = S / 5
  const f = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const s = (y + Math.abs(x - S / 2) * 1.1) / period
      const strand = Math.abs(Math.sin(Math.PI * s))
      const centre = Math.abs(x - S / 2) < S * 0.025 ? -0.5 : 0
      f[y * S + x] = strand + centre + fib[y * S + x] * 0.35
    }
  }
  return tex(S, S, toNormal(f, S, S, 1.6))
}

/** Kusari: butted iron rings, rotated ovals in a staggered grid. */
function chainN(S) {
  const n = 6
  const cell = S / n
  const rx = cell * 0.43
  const ry = cell * 0.37
  const thick = cell * 0.1
  const cosA = Math.cos(-0.55)
  const sinA = Math.sin(-0.55)
  const f = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hgt = 0
      const row = Math.floor(y / cell)
      for (let oy = -1; oy <= 1; oy++) {
        const ry_ = row + oy
        const shift = wrap(ry_, n) % 2 ? 0.5 : 0
        const col = Math.floor(x / cell - shift)
        for (let ox = -1; ox <= 1; ox++) {
          const cxp = (col + ox + shift) * cell + cell / 2
          const cyp = ry_ * cell + cell / 2
          let dx = x - cxp
          let dy = y - cyp
          dx -= Math.round(dx / S) * S
          dy -= Math.round(dy / S) * S
          const lx = dx * cosA - dy * sinA
          const ly = (dx * sinA + dy * cosA) * (rx / ry)
          const d = Math.abs(Math.hypot(lx, ly) - rx)
          if (d < thick) hgt = Math.max(hgt, Math.sqrt(1 - (d / thick) ** 2) * (1 + 0.2 * (wrap(ry_, 2) ? 1 : 0)))
        }
      }
      f[y * S + x] = hgt * 4
    }
  }
  return tex(S, S, toNormal(f, S, S, 1.5))
}

/** Plaited straw for the sandal soles. */
function strawN(S) {
  const r = rng(61)
  const fib = noise(S, S, r, [[S / 2, 1, S / 8]])
  const band = S / 4
  const period = S / 6
  const f = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const dir = Math.floor(y / band) % 2 ? -1 : 1
    for (let x = 0; x < S; x++) {
      f[y * S + x] = 0.5 + 0.5 * Math.sin((2 * Math.PI * (x + dir * y)) / period) + fib[y * S + x] * 0.3
    }
  }
  return tex(S, S, toNormal(f, S, S, 1.4))
}

/** Wood grain showing faintly through the saya's black lacquer (grain runs along u). */
function woodN(S) {
  const r = rng(67)
  const f = noise(S, S, r, [[3, 0.5, 48], [6, 0.3, 96], [24, 0.2, 128]])
  for (let i = 0; i < f.length; i++) f[i] = f[i] * 3 + Math.sin(f[i] * 40) * 0.15
  scratches(f, S, S, r, { count: Math.round(30 * (S / 256) ** 2), len: [6, 40], width: 1, depth: 0.5 })
  return tex(S, S, toNormal(f, S, S, 1.2))
}

/** Subtle tonal variation for cloth: uneven dye and fading. */
function fabricTone(S) {
  const r = rng(71)
  const f = noise(S, S, r, [[3, 0.5], [12, 0.3], [48, 0.2]])
  return tex(S, S, toGray(f, 0.86, 1))
}

/**
 * The blade, in blade space: u runs from the spine (0) to the edge (1), v
 * along the length. The ji is mirror-polished steel with polishing streaks
 * and a few fine scratches; the hamon is a wavy gunome line, beyond which
 * the ha is cloudy, brighter and matte; a misty nioi line marks the boundary
 * and the shinogi ridge shows as a crisp step.
 */
function blade(W, H) {
  const r = rng(71)
  const cloud = noise(W, H, r, [[4, 0.45, 16], [16, 0.3, 64], [64, 0.25, 256]])
  const streak = new Float32Array(W)
  for (let i = 0; i < W; i++) streak[i] = r()
  const wobble = noise(1, H, r, [[1, 0.6, 12], [1, 0.4, 48]])
  const polish = new Float32Array(W * H)
  // Polishing marks run almost along the blade.
  scratches(polish, W, H, r, { count: Math.round(120 * (W / 256) * (H / 1024)), len: [H * 0.05, H * 0.2], width: 0.8, depth: -1, angle: [Math.PI / 2 - 0.08, Math.PI / 2 + 0.08] })
  scratches(polish, W, H, r, { count: Math.round(25 * (W / 256) * (H / 1024)), len: [6, 30], width: 0.8, depth: -1 })
  const nioi = (d) => Math.exp(-(d * d) / (2 * 0.011 * 0.011))
  const ridge = (u) => Math.exp(-((u - 0.3) * (u - 0.3)) / (2 * 0.005 * 0.005))
  const colour = new Float32Array(W * H)
  const rough = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    const v = y / H
    const hm =
      0.6 + 0.075 * Math.sin(v * Math.PI * 2 * 9.5) + 0.03 * Math.sin(v * Math.PI * 2 * 26 + 1.3) + (wobble[y] - 0.5) * 0.12
    for (let x = 0; x < W; x++) {
      const u = x / W
      const d = u - hm
      const i = y * W + x
      const c = cloud[i]
      const s = streak[x]
      let col = d < 0 ? 0.8 + s * 0.05 + (u < 0.3 ? 0.035 : 0) : 0.9 + c * 0.09
      col = col + (1 - col) * nioi(d) * 0.9
      colour[i] = col + (0.66 - col) * ridge(u) * 0.55 - polish[i] * 0.02
      let ro = d < 0 ? 0.12 + s * 0.06 : 0.4 + c * 0.14
      ro = ro + (0.5 - ro) * nioi(d)
      rough[i] = ro + Math.min(polish[i], 1) * 0.12
    }
  }
  return { blade: tex(W, H, toGray(colour, 0, 1)), bladeRough: tex(W, H, toGray(rough, 0, 1)) }
}

/**
 * The kabuto's finish: black urushi flecked with gold leaf. The flakes
 * gather in drifts rather than spreading evenly: most are tiny specks, a few
 * are larger torn pieces, and there are thin cut slivers (kirigane) too.
 * Colour is final (sRGB), so the material is left white; in the roughness
 * map the flakes are smoother than the lacquer, so they sparkle.
 */
function goldFlake(S) {
  const r = rng(83)
  const k = S / 512
  const ground = noise(S, S, r, [[8, 0.5], [32, 0.3], [128, 0.2]])
  const drift = noise(S, S, r, [[3, 0.6], [9, 0.4]])
  const colour = new Uint8Array(S * S * 4)
  const rough = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) {
    const v = 10 + ground[i] * 10
    colour[i * 4] = v
    colour[i * 4 + 1] = v
    colour[i * 4 + 2] = v * 1.1
    colour[i * 4 + 3] = 255
    rough[i] = 0.88 + ground[i] * 0.12
  }
  const lo = [150, 104, 34]
  const hi = [246, 214, 128]
  const paint = (px, py, c, a, ro) => {
    const i = wrap(py, S) * S + wrap(px, S)
    for (let ch = 0; ch < 3; ch++) colour[i * 4 + ch] += (c[ch] - colour[i * 4 + ch]) * a
    rough[i] += (ro - rough[i]) * a
  }
  const flake = (cx, cy, rx, ry, ang, jag, c) => {
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    const phase = r() * 6
    const reach = Math.ceil(Math.max(rx, ry) * (1 + jag) + 1)
    for (let py = Math.floor(cy - reach); py <= Math.ceil(cy + reach); py++) {
      for (let px = Math.floor(cx - reach); px <= Math.ceil(cx + reach); px++) {
        const dx = px + 0.5 - cx
        const dy = py + 0.5 - cy
        const lx = (dx * cos + dy * sin) / rx
        const ly = (-dx * sin + dy * cos) / ry
        const edge = 1 + jag * Math.sin(Math.atan2(ly, lx) * 5 + phase)
        const q = (lx * lx + ly * ly) / (edge * edge)
        if (q >= 1) continue
        paint(px, py, c, Math.min(1, (1 - q) * 3), 0.42)
      }
    }
  }
  const tone = () => {
    const t = r()
    return lo.map((l, ch) => l + (hi[ch] - l) * t)
  }
  for (let n = 0; n < Math.round(2600 * k * k); n++) {
    const x = r() * S
    const y = r() * S
    if (r() > drift[wrap(Math.floor(y), S) * S + wrap(Math.floor(x), S)] ** 2 * 1.7) continue
    const big = r() < 0.05
    const rx = Math.max(0.7, (big ? 5 + r() * 8 : 0.8 + r() * 2.6) * k)
    flake(x, y, rx, rx * (0.35 + r() * 0.65), r() * Math.PI, big ? 0.25 : 0.08, tone())
  }
  // Kirigane: thin slivers of cut leaf
  const slivers = new Float32Array(S * S)
  scratches(slivers, S, S, r, { count: Math.round(160 * k * k), len: [4 * k, 14 * k], width: 0.9, depth: -1 })
  const sliverTone = tone()
  for (let i = 0; i < S * S; i++) {
    const a = Math.min(1, slivers[i])
    if (a > 0.05) paint(i % S, Math.floor(i / S), sliverTone, a, 0.42)
  }
  for (let i = 0; i < S * S * 4; i++) colour[i] = Math.round(colour[i])
  return { flakeC: tex(S, S, colour), flakeR: tex(S, S, toGray(rough, 0, 1)) }
}

/**
 * Engraving for the gilt crest: scrolling cloud spirals, with flowing
 * parallel lines chased into the ground between them. The colour map darkens
 * the cuts, as patina settles into engraved gold.
 */
function engraving(S) {
  const r = rng(89)
  const k = S / 512
  const cells = 3
  const cs = S / cells
  const scrolls = []
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      scrolls.push({
        x: (cx + 0.3 + r() * 0.4) * cs,
        y: (cy + 0.3 + r() * 0.4) * cs,
        R: cs * (0.36 + r() * 0.08),
        dir: r() < 0.5 ? 1 : -1,
        rot: r() * Math.PI * 2,
        turns: 2.2 + r() * 0.8,
      })
    }
  }
  const lineW = 1.4 * k + 0.6
  const groove = (d, w) => (d < w ? 1 - (d / w) ** 2 : 0)
  const cut = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let g = 0
      let inside = 0
      for (const c of scrolls) {
        let dx = x - c.x
        let dy = y - c.y
        dx -= Math.round(dx / S) * S
        dy -= Math.round(dy / S) * S
        const rr = Math.hypot(dx, dy)
        if (rr > c.R) continue
        inside = Math.max(inside, 1 - rr / c.R)
        const th = Math.atan2(dy, dx) * c.dir + c.rot
        const s = (rr / c.R) * c.turns - th / (Math.PI * 2)
        const f = Math.abs(s - Math.round(s))
        const fade = smooth(clamp01((c.R - rr) / (c.R * 0.15)))
        g = Math.max(g, groove((f * c.R) / c.turns, lineW) * fade)
      }
      if (inside < 0.08) {
        // Flowing lines: 24 across the tile, each swaying twice
        const w = (y / S) * 24 + 1.1 * Math.sin((x / S) * Math.PI * 2 * 2 + (y / S) * Math.PI * 2)
        const d = Math.abs(w - Math.round(w)) * (S / 24)
        g = Math.max(g, groove(d, lineW * 0.8) * 0.7 * (1 - inside / 0.08))
      }
      cut[y * S + x] = g
    }
  }
  const h = new Float32Array(S * S)
  const shade = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) {
    h[i] = -cut[i]
    shade[i] = 1 - cut[i] * 0.45
  }
  return { engraveN: tex(S, S, toNormal(h, S, S, 2.4)), engraveC: tex(S, S, toGray(shade, 0, 1)) }
}

/**
 * Stencilled leather for the tsurubashiri-gawa, the panel laced over the
 * front of an ō-yoroi's dō: a hishi (diamond) lattice of double lines with a
 * four-petalled hanabishi in every diamond, stencilled in pale lacquer on
 * indigo-dyed leather. Unlike the grey maps, the colour map carries the real
 * colours (its material is white). The stencil stands a hair proud of the
 * grain and is rubbed thin in patches.
 */
function stencil(S) {
  const r = rng(131)
  const n = 3 // diamonds per tile along each diagonal
  const cell = S / n
  const grainF = noise(S, S, r, [[S / 4, 0.5], [S / 8, 0.3], [S / 16, 0.2]])
  const wear = noise(S, S, r, [[5, 0.6], [11, 0.4]])
  const { f1, f2 } = worley(S, S, r, Math.round(S / 9))
  const ground = [0.17, 0.21, 0.31]
  const ink = [0.84, 0.79, 0.67]
  const out = new Uint8Array(S * S * 4)
  const h = new Float32Array(S * S)
  const lw = cell * 0.03
  const R = cell * 0.2
  const aa = (d) => clamp01(0.5 - d) // 1 inside (d < 0), a pixel of soft edge
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (n * (x + y)) / S
      const v = (n * (x - y)) / S
      const fu = u - Math.floor(u)
      const fv = v - Math.floor(v)
      // Distance in pixels to the nearest diamond edge
      const e = (Math.min(fu, 1 - fu, fv, 1 - fv) * cell) / Math.SQRT2
      const line = Math.max(aa(e - lw), 0.85 * aa(Math.abs(e - lw * 3.2) - lw * 0.45))
      // The hanabishi: four petals along the image axes, a dot at the heart
      const dx = ((fu - 0.5 + (fv - 0.5)) * cell) / 2
      const dy = ((fu - 0.5 - (fv - 0.5)) * cell) / 2
      let flower = 0
      for (const [ax, ay] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const along = dx * ax + dy * ay - R * 0.6
        const across = dx * ay - dy * ax
        // A petal with a notch at its tip, as the hanabishi is drawn
        const q = Math.sqrt((along / (R * 0.55)) ** 2 + (across / (R * 0.34)) ** 2) - 1
        const notch = Math.hypot(along - R * 0.62, across) - R * 0.14
        flower = Math.max(flower, aa(Math.max(q * R * 0.34, -notch)))
      }
      flower = Math.max(flower, aa(Math.hypot(dx, dy) - R * 0.16))
      const i = y * S + x
      const rubbed = clamp01((wear[i] - 0.52) * 3.5)
      const m = Math.max(line, flower) * (1 - 0.35 * rubbed)
      const pore = smooth(clamp01((f2[i] - f1[i]) / 0.3))
      const tone = 0.82 + 0.26 * grainF[i] + 0.08 * pore
      for (let c = 0; c < 3; c++) {
        out[i * 4 + c] = Math.round(clamp01(ground[c] * tone * (1 - m) + ink[c] * (0.9 + 0.1 * grainF[i]) * m) * 255)
      }
      out[i * 4 + 3] = 255
      h[i] = pore * 0.35 + grainF[i] * 0.25 + m * 0.9
    }
  }
  return { stencilC: tex(S, S, out), stencilN: tex(S, S, toNormal(h, S, S, 1.6)) }
}

/** Distance from p to the segment ab. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Asanoha (hemp leaf) woven into silk, for the kosode worn under the armour.
 * On a triangle lattice, every triangle's edges and the lines from its
 * corners to its centre are woven as glossy satin floats in a lighter thread
 * than the twill ground, so the six-pointed stars catch the light. Five
 * triangles across and three double rows down keep the lattice within 4% of
 * equilateral on a square tile.
 *   asanohaC  colour multiplier: satin 1, ground ~0.6
 *   asanohaR  roughness multiplier: the satin is much smoother
 */
function asanoha(S) {
  const r = rng(149)
  const n = 5
  const m = 3
  const side = S / n
  const h = S / (2 * m)
  const lw = Math.max(0.9, S / 220)
  const slub = noise(S, S, r, [[S / 8, 0.6, S / 64], [S / 16, 0.4, S / 128]])
  const col = new Float32Array(S * S)
  const rough = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const j = (y + 0.5) / h
      const i = (x + 0.5) / side - j / 2
      const I = Math.floor(i)
      const J = Math.floor(j)
      const fi = i - I
      const fj = j - J
      // The triangle holding this pixel, as three lattice points (i, j)
      const tri = fi + fj < 1 ? [[I, J], [I + 1, J], [I, J + 1]] : [[I + 1, J], [I + 1, J + 1], [I, J + 1]]
      const pts = tri.map(([a, b]) => [(a + b / 2) * side, b * h])
      const gx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3
      const gy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3
      const px = x + 0.5
      const py = y + 0.5
      let d = Infinity
      for (let k = 0; k < 3; k++) {
        const [ax, ay] = pts[k]
        const [bx, by] = pts[(k + 1) % 3]
        d = Math.min(d, segDist(px, py, ax, ay, bx, by), segDist(px, py, ax, ay, gx, gy))
      }
      const satin = clamp01(lw + 0.5 - d)
      const idx = y * S + x
      col[idx] = 0.58 + 0.08 * slub[idx] + 0.42 * satin
      rough[idx] = 1 - 0.5 * satin + 0.06 * slub[idx]
    }
  }
  return { asanohaC: tex(S, S, toGray(col, 0, 1)), asanohaR: tex(S, S, toGray(rough, 0, 1)) }
}

/**
 * Shima: the woven stripes of a hakama — broad dark bands split by fine
 * light pinstripes and a mid-tone stripe, the threads a little uneven
 * (slubbed) along their length. Stripes run up the leg (constant in x).
 */
function shima(S) {
  const r = rng(157)
  // [width as a share of the tile, tone]
  const bands = [
    [0.2, 0.52],
    [0.012, 1],
    [0.05, 0.72],
    [0.012, 1],
    [0.2, 0.52],
    [0.03, 0.82],
    [0.16, 0.46],
    [0.012, 0.95],
    [0.03, 0.82],
    [0.294, 0.5],
  ]
  const toneAt = new Float32Array(S)
  let x0 = 0
  for (const [w, tone] of bands) {
    const x1 = x0 + w * S
    for (let x = Math.floor(x0); x < Math.min(S, Math.ceil(x1)); x++) toneAt[x] = tone
    x0 = x1
  }
  const slub = noise(S, S, r, [[S / 2, 0.6, S / 32], [S / 4, 0.4, S / 64]])
  const f = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) f[y * S + x] = toneAt[x] * (0.9 + 0.2 * slub[y * S + x])
  }
  return tex(S, S, toGray(f, 0, 1))
}

/**
 * Hakata-ori, the stiff silk woven for obi: bands along the belt (x runs
 * round the waist, y across it) with a row of tokko — the vajra motif, two
 * lozenges meeting at a waisted bar — down the middle.
 */
function hakata(S) {
  const r = rng(163)
  const slub = noise(S, S, r, [[S / 32, 0.6, S / 4], [S / 64, 0.4, S / 8]])
  // [from, to, tone] across the belt (v 0 → 1)
  const bands = [
    [0, 0.07, 0.45],
    [0.07, 0.1, 1],
    [0.1, 0.15, 0.55],
    [0.15, 0.85, 0.78],
    [0.85, 0.9, 0.55],
    [0.9, 0.93, 1],
    [0.93, 1, 0.45],
  ]
  const f = new Float32Array(S * S)
  const period = S / 2
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S
    let tone = 0.78
    for (const [a, b, t] of bands) if (v >= a && v < b) tone = t
    for (let x = 0; x < S; x++) {
      let t = tone
      if (v > 0.25 && v < 0.75) {
        // Tokko: two lozenges tip to tip, joined by a waisted bar
        const cx = (((x + 0.5) % period) / period - 0.5) * 2
        const cy = (v - 0.5) / 0.25
        const lozenge = Math.abs(Math.abs(cx) - 0.55) / 0.42 + Math.abs(cy) / 0.9
        const bar = Math.abs(cx) < 0.18 && Math.abs(cy) < 0.2
        if (lozenge < 1 || bar) t = 1
        else if (lozenge < 1.18) t = 0.6
      }
      f[y * S + x] = t * (0.93 + 0.14 * slub[y * S + x])
    }
  }
  return tex(S, S, toGray(f, 0, 1))
}

/**
 * Sashiko: the quilting stitches of padded cotton — rows of short running
 * stitches along a square grid, the stitches stopping short of each
 * crossing, in a pale thread over indigo cotton.
 */
function sashiko(S) {
  const r = rng(167)
  const cells = 8
  const c = S / cells
  const slub = noise(S, S, r, [[S / 8, 0.5], [S / 16, 0.5]])
  const f = new Float32Array(S * S)
  const lw = Math.max(0.8, S / 300)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = ((x + 0.5) % c) / c
      const fy = ((y + 0.5) % c) / c
      // Three stitches per cell edge, each 60% of its slot, none at the crossings
      const dash = (t) => {
        const s = t * 3
        const u = s - Math.floor(s)
        return u > 0.2 && u < 0.8 && t > 0.08 && t < 0.92
      }
      const onV = Math.min(fx, 1 - fx) * c < lw && dash(fy)
      const onH = Math.min(fy, 1 - fy) * c < lw && dash(fx)
      f[y * S + x] = onV || onH ? 1 : 0.46 + 0.1 * slub[y * S + x]
    }
  }
  return tex(S, S, toGray(f, 0, 1))
}

/** A soft halo for the eye slits (white, with falloff in alpha). */
function glow(S) {
  const out = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2)
      const a = d >= 1 ? 0 : d < 0.3 ? 1 - (d / 0.3) * 0.6 : d < 0.7 ? 0.4 - ((d - 0.3) / 0.4) * 0.32 : 0.08 * (1 - (d - 0.7) / 0.3)
      const i = (y * S + x) * 4
      out[i] = out[i + 1] = out[i + 2] = 255
      out[i + 3] = Math.round(a * 255)
    }
  }
  return tex(S, S, out)
}

/* ================================================================
   Everything, at the requested quality
   ================================================================ */
export function generateTextures(quality = 'high') {
  const S = quality === 'low' ? 256 : 512
  const s = S / 2
  return {
    grain: grain(s),
    mottle: mottle(S),
    lacquerN: lacquerN(S),
    kozaneN: kozaneN(S),
    ...iron(S),
    weaveN: weaveN(s),
    leatherN: leatherN(s),
    braidN: braidN(Math.max(64, s / 2)),
    chainN: chainN(s),
    strawN: strawN(Math.max(64, s / 2)),
    woodN: woodN(s),
    fabricTone: fabricTone(s),
    ...blade(s, S * 2),
    ...goldFlake(S),
    ...engraving(S),
    ...stencil(s),
    ...asanoha(s),
    shimaC: shima(s),
    obiC: hakata(s),
    sashikoC: sashiko(s),
    glow: glow(64),
  }
}
