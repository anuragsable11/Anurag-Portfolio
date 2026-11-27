import { useEffect, useRef, useState } from 'react'
import { TECH } from '../data/tech.js'
import { prefersReducedMotion } from '../lib/capabilities.js'
import { reportSkill } from '../lib/companion.js'

/**
 * The tech stack as app-icon tiles scattered around the section title.
 *
 * Drawn on a 2D canvas; a couple of dozen sprites need nothing heavier.
 *  - Entrance: when the section scrolls into view, the icons rise out from
 *    behind the title in a ripple, nearest first, each with a soft overshoot.
 *  - Rest: each icon floats a few pixels around its spot on its own slow loop.
 *  - Cursor: an icon the pointer touches says what it is (a small label
 *    with the tool's name) and comes along under the pointer; the ones
 *    touched before it string out behind along the path the pointer drew,
 *    evenly spaced at any speed. Stop, and the chain holds its shape.
 *    Leave, click or lift a finger, and they glide home, the last name
 *    lingering a moment. So pointing at a logo (or tapping it) names it.
 *  - With reduced motion nothing moves, but pointing at or tapping an icon
 *    still shows its name.
 *
 * The simulation steps at a fixed 60 Hz, so it feels the same everywhere,
 * and each frame is drawn between the last two steps, so the motion stays
 * even on 59, 75, 120 or 144 Hz screens instead of stepping or stalling.
 */

// Entrance, in milliseconds
const STAGGER = 55
const POP = 650

const STEP = 1000 / 60
const SPRING = 0.08
const DAMPING = 0.82
// Pointer trail: the path is kept as points SEG px apart, so neighbours in
// the chain sit a fixed distance apart along it; FOLLOW is how quickly each
// icon closes on its point.
const SEG = 4
const FOLLOW = 0.16
// After a click, the pointer must move this far before it gathers them again.
const REGATHER = 24
// The resting float, in px.
const FLOAT = 5
// The name label: how long it stays once the icons are let go (longer after
// a tap, which is how a phone asks), and its fades, in milliseconds.
const LINGER = 1300
const LINGER_TAP = 2200
const FADE_IN = 140
const FADE_OUT = 300

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => Math.min(Math.max(t, 0), 1)
/** Overshoots by about 10% at c = 1.70158, and about 18% at c = 2.4. */
const easeOutBack = (t, c = 1.70158) => 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
const easeOutCubic = (t) => 1 - (1 - t) ** 3

/** Seeded, so the icons land in the same places on every visit. */
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

/**
 * Home spots: an even scatter across the stage that keeps clear of `zones`
 * (the title, the hint), each given as a centre and half-extents. Darts are
 * thrown until every icon has a spot at least `gap` from the others, easing
 * the gap off if the space is too tight for it.
 */
function scatter(count, halfW, halfH, zones) {
  const blocked = zones.reduce(
    (sum, z) => sum + 4 * Math.min(z.hw, halfW) * Math.min(z.hh, halfH),
    0
  )
  const open = 4 * halfW * halfH - blocked
  let gap = Math.sqrt(Math.max(open, 1) / count) * 0.85
  for (let round = 0; round < 30; round++, gap *= 0.93) {
    const rand = rng(1337)
    const spots = []
    for (let tries = 0; tries < 8000 && spots.length < count; tries++) {
      const x = (rand() * 2 - 1) * halfW
      const y = (rand() * 2 - 1) * halfH
      if (zones.some((z) => Math.abs(x - z.x) < z.hw && Math.abs(y - z.y) < z.hh)) continue
      if (spots.every((s) => Math.hypot(s.x - x, s.y - y) >= gap)) spots.push({ x, y })
    }
    if (spots.length === count) return spots
  }
  // Nowhere near enough room: fall back to a ring.
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    return { x: Math.cos(a) * halfW, y: Math.sin(a) * halfH }
  })
}

/* ---- Colour: keep every logo legible on its tile ---- */
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const channel = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Lifts a dark brand colour toward white until it reads on the tile. */
function legible(hex, tile) {
  const bg = hexToRgb(tile)
  let rgb = hexToRgb(hex)
  for (let k = 0; k < 12 && contrast(rgb, bg) < 3; k++) rgb = rgb.map((c) => c + (255 - c) * 0.18)
  return `rgb(${rgb.map(Math.round).join(',')})`
}

/* ---- Tiles ---- */

function roundedSquare(ctx, x, y, s, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + s, y, x + s, y + s, r)
  ctx.arcTo(x + s, y + s, x, y + s, r)
  ctx.arcTo(x, y + s, x, y, r)
  ctx.arcTo(x, y, x + s, y, r)
  ctx.closePath()
}

/** Rasterises a react-icons <svg> in the given colour. */
function loadLogo(svg, color) {
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '256')
  clone.setAttribute('height', '256')
  // react-icons fill with currentColor, which only resolves from `color`.
  clone.style.color = color
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    new XMLSerializer().serializeToString(clone)
  )}`
  return img.decode().then(() => img)
}

/**
 * Paints one app-icon tile, shadow included, into its own canvas. It is
 * painted at 1.5× the device resolution so it stays sharp at the peak of the
 * entrance pop.
 */
function paintTile(logo, tech, { size, ratio, tile, edge }) {
  const pad = Math.ceil(size * 0.24)
  const full = size + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.ceil(full * ratio)
  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  const r = size * 0.23

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = size * 0.2
  ctx.shadowOffsetY = size * 0.08
  roundedSquare(ctx, pad, pad, size, r)
  ctx.fillStyle = tech.knockout || tile
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundedSquare(ctx, pad, pad, size, r)
  ctx.clip()
  if (tech.knockout) {
    // A logo that is itself a filled square becomes the whole tile, with the
    // knockout colour showing through its cut-outs.
    ctx.drawImage(logo, pad - size * 0.02, pad - size * 0.02, size * 1.04, size * 1.04)
  } else {
    const s = size * 0.56
    ctx.drawImage(logo, pad + (size - s) / 2, pad + (size - s) / 2, s, s)
  }
  // A soft sheen across the top, like a glossy app icon
  const sheen = ctx.createLinearGradient(0, pad, 0, pad + size)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.1)')
  sheen.addColorStop(0.55, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = sheen
  ctx.fillRect(pad, pad, size, size)
  ctx.restore()

  // A hairline edge, so the tile keeps its shape against a dark page
  roundedSquare(ctx, pad + 0.5, pad + 0.5, size - 1, r)
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.stroke()

  return { canvas, full }
}

/** A pill-shaped path, `h` tall, with its top-left corner at (x, y). */
function pill(ctx, x, y, w, h) {
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// What to try next, by input: `home` hints show while the icons are away.
const HINTS = {
  gather: 'Move your mouse over the icons',
  gatherTouch: 'Tap or drag the icons',
  home: 'Click to reset',
  homeTouch: 'Let go to reset',
}

export default function SkillsSwarm({ centerRef }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const sourceRef = useRef(null)
  const [hint, setHint] = useState(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const source = sourceRef.current
    const center = centerRef.current
    const ctx = canvas?.getContext('2d')
    if (!wrap || !source || !center || !ctx) return

    const still = prefersReducedMotion()
    const touch = window.matchMedia('(pointer: coarse)').matches
    let hintNow = null
    const showHint = (key) => {
      if (still || key === hintNow) return
      hintNow = key
      setHint(key)
    }
    showHint(touch ? 'gatherTouch' : 'gather')

    const rand = rng(7)
    const icons = TECH.map((tech) => ({
      tech,
      // Where it is now, and where it was a step ago (frames draw between).
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      homeX: 0,
      homeY: 0,
      scale: still ? 1 : 0,
      delay: 0,
      chained: false,
      // Its own float: a period of 3.5–6 s on each axis, and a phase.
      wx: (Math.PI * 2) / (3500 + rand() * 2500),
      wy: (Math.PI * 2) / (3500 + rand() * 2500),
      fx: rand() * Math.PI * 2,
      fy: rand() * Math.PI * 2,
      tile: null,
    }))
    const view = { w: 0, h: 0, ratio: 1, size: 0, gap: 1, maxTrail: 1 }
    const pointer = { x: 0, y: 0, active: false, heldAt: null }
    const trail = []
    // The chain, newest first: order[0] is the icon under the pointer.
    let order = []
    // The name on show: whose it is, when it appeared, and when it goes
    // (Infinity while its icon is being held). Colours follow the theme.
    const label = { icon: null, born: 0, until: Infinity }
    const labelLook = { bg: '#fbf9f4', fg: '#1c1b19', border: '#cfc7b9' }
    // waiting → entering → idle. Once idle, the icons the pointer has touched
    // trail it through the stage, and the rest float on their spots.
    let mode = still ? 'idle' : 'waiting'
    let enterAt = 0
    let clock = 0
    let destroyed = false

    /* ---- Tiles, repainted when the size or the theme changes ---- */
    let paintJob = 0
    const paintTiles = async () => {
      const job = ++paintJob
      const dark = document.documentElement.dataset.theme === 'dark'
      // The name label wears the page's card, ink and hairline.
      const css = getComputedStyle(wrap)
      const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback
      labelLook.bg = token('--card', labelLook.bg)
      labelLook.fg = token('--fg', labelLook.fg)
      labelLook.border = token('--border-hi', labelLook.border)
      const tile = dark ? '#232327' : '#141416'
      const look = {
        size: view.size,
        // Sharp at the 1.5× peak of the pop, capped to keep memory sane
        ratio: Math.min(window.devicePixelRatio || 1, 2) * 1.5,
        tile,
        edge: dark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.07)',
      }
      const svgs = source.querySelectorAll('svg')
      const tiles = await Promise.all(
        icons.map(({ tech }, i) => {
          const color = tech.knockout ? tech.color : legible(tech.color || '#f4f4f5', tile)
          return svgs[i]
            ? loadLogo(svgs[i], color)
                .then((logo) => paintTile(logo, tech, look))
                .catch(() => null)
            : null
        })
      )
      if (destroyed || job !== paintJob) return
      tiles.forEach((t, i) => {
        icons[i].tile = t
      })
      draw()
    }

    /* ---- Layout: canvas size and each icon's home ---- */
    const layout = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
      // Smaller on narrow phones, so every tile finds a spot clear of the rest.
      const size = w < 480 ? 52 : w < 640 ? 60 : 80
      const resized = size !== view.size
      Object.assign(view, { w, h, ratio, size })

      // Keep clear of the title and of the hint along the bottom edge.
      const stage = wrap.getBoundingClientRect()
      const title = center.getBoundingClientRect()
      const titleX = title.left + title.width / 2 - (stage.left + w / 2)
      const titleY = title.top + title.height / 2 - (stage.top + h / 2)
      const clear = size * 0.55 + 8
      // Sideways the tiles keep inside the page's gutter (the CSS --gutter,
      // clamp(20px, 4vw, 80px)) even as they float; up and down, a little
      // under a tile's size from the stage edge.
      const gutter = Math.min(80, Math.max(20, window.innerWidth * 0.04))
      const marginX = gutter + size / 2 + FLOAT
      const marginY = size * 0.62
      // The hint pill: about 38px tall, 22px off the bottom, ~250px wide.
      const spots = scatter(icons.length, Math.min(w / 2 - marginX, 820), h / 2 - marginY, [
        { x: titleX, y: titleY, hw: title.width / 2 + clear, hh: title.height / 2 + clear },
        { x: 0, y: h / 2 - 41, hw: 125 + clear, hh: 19 + clear + FLOAT },
      ])
      icons.forEach((icon, i) => {
        icon.homeX = spots[i].x
        icon.homeY = spots[i].y
        if (still) {
          icon.x = icon.px = icon.homeX
          icon.y = icon.py = icon.homeY
        }
      })
      // The entrance ripples outward: nearest the title first.
      icons
        .map((icon) => [icon, Math.hypot(icon.homeX - titleX, icon.homeY - titleY)])
        .sort((a, b) => a[1] - b[1])
        .forEach(([icon], rank) => {
          icon.delay = rank * STAGGER
        })
      // Neighbours in the chain sit 0.8 of a tile apart along the path.
      view.gap = Math.max(1, Math.round((size * 0.8) / SEG))
      view.maxTrail = icons.length * view.gap + 1

      if (resized) paintTiles()
      draw()
    }

    /* ---- Simulation ---- */
    // Where an icon rests at this moment: its spot, plus its float.
    const restX = (icon) => icon.homeX + Math.sin(clock * icon.wx + icon.fx) * FLOAT
    const restY = (icon) => icon.homeY + Math.cos(clock * icon.wy + icon.fy) * FLOAT * 0.8

    /** The entrance is timed against the clock, so it is posed every frame. */
    const enter = (now) => {
      let done = true
      for (const icon of icons) {
        const k = clamp01((now - enterAt - icon.delay) / POP)
        if (k < 1) done = false
        // They glide to their spots without overshooting (onto a neighbour,
        // the hint or past the gutter); only their size springs.
        const e = k > 0 ? easeOutCubic(k) : 0
        icon.x = icon.px = icon.homeX * e
        icon.y = icon.py = icon.homeY * e
        icon.scale = k > 0 ? easeOutBack(k, 2.4) : 0
      }
      if (done) {
        mode = 'idle'
        for (const icon of icons) {
          icon.scale = 1
          icon.vx = icon.vy = 0
        }
      }
    }

    /** Extends the path to the pointer in SEG-long pieces. */
    const extendTrail = () => {
      let head = trail[trail.length - 1]
      if (!head) {
        trail.push({ x: pointer.x, y: pointer.y })
        return
      }
      for (;;) {
        const dx = pointer.x - head.x
        const dy = pointer.y - head.y
        const d = Math.hypot(dx, dy)
        if (d < SEG) break
        head = { x: head.x + (dx / d) * SEG, y: head.y + (dy / d) * SEG }
        trail.push(head)
      }
      if (trail.length > view.maxTrail) trail.splice(0, trail.length - view.maxTrail)
    }

    const step = () => {
      for (const icon of icons) {
        icon.px = icon.x
        icon.py = icon.y
      }
      if (mode !== 'idle') return
      clock += STEP

      for (const icon of icons) icon.chained = false
      if (pointer.active) {
        extendTrail()
        // Each icon in the chain (see collect) closes on its own point along
        // the path: the newest under the pointer, the rest a fixed distance
        // apart behind it, bunched at the path's start while it is short.
        order.forEach((i, k) => {
          const at = Math.max(0, trail.length - 1 - k * view.gap)
          const icon = icons[i]
          const x = lerp(icon.x, trail[at].x, FOLLOW)
          const y = lerp(icon.y, trail[at].y, FOLLOW)
          // Keep its speed, so letting go carries straight into the glide home.
          icon.vx = x - icon.x
          icon.vy = y - icon.y
          icon.x = x
          icon.y = y
          icon.chained = true
        })
      }

      for (const icon of icons) {
        if (icon.chained) continue
        icon.vx = (icon.vx + (restX(icon) - icon.x) * SPRING) * DAMPING
        icon.vy = (icon.vy + (restY(icon) - icon.y) * SPRING) * DAMPING
        icon.x += icon.vx
        icon.y += icon.vy
      }
    }

    /** Paints the frame `alpha` of the way from the last step to the next. */
    const draw = (alpha = 1) => {
      const { w, h, ratio } = view
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(ratio, 0, 0, ratio, (w / 2) * ratio, (h / 2) * ratio)
      const paint = (icon) => {
        if (icon.scale <= 0 || !icon.tile) return
        const d = icon.tile.full * icon.scale
        const x = lerp(icon.px, icon.x, alpha)
        const y = lerp(icon.py, icon.y, alpha)
        ctx.drawImage(icon.tile.canvas, x - d / 2, y - d / 2, d, d)
      }
      // The chain over the rest, its leader on top.
      for (const icon of icons) if (!icon.chained) paint(icon)
      for (let k = order.length - 1; k >= 0; k--) {
        if (icons[order[k]].chained) paint(icons[order[k]])
      }
      drawLabel(alpha)
    }

    /**
     * The name of the icon last touched, on a small pill beside it: under
     * it for a mouse, over it for a finger (which hides what is below), kept
     * inside the stage and off the hint. It fades in, and out once its time
     * is up.
     */
    const drawLabel = (alpha) => {
      const icon = label.icon
      if (!icon) return
      const now = performance.now()
      if (now >= label.until + FADE_OUT) {
        label.icon = null
        return
      }
      const fade =
        clamp01((now - label.born) / FADE_IN) *
        (now > label.until ? 1 - (now - label.until) / FADE_OUT : 1)
      if (fade <= 0) return

      const { w, h, size } = view
      const x = lerp(icon.px, icon.x, alpha)
      const y = lerp(icon.py, icon.y, alpha)
      const tall = 26
      ctx.font = '600 13px "Montserrat Variable", ui-sans-serif, system-ui, sans-serif'
      const wide = Math.ceil(ctx.measureText(icon.tech.name).width) + 24
      const edge = 8
      const gap = touch ? 12 : 8
      const left = Math.min(Math.max(x - wide / 2, -w / 2 + edge), w / 2 - edge - wide)
      const below = y + size / 2 + gap
      const above = y - size / 2 - gap - tall
      // The hint pill sits centred along the bottom (see layout).
      const overHint = Math.abs(left + wide / 2) < 130 + wide / 2
      const fitsBelow = below + tall <= (overHint ? h / 2 - 62 : h / 2 - edge)
      const fitsAbove = above >= -h / 2 + edge
      const top = (touch ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove) ? above : below

      ctx.save()
      ctx.globalAlpha = fade
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 3
      pill(ctx, left, top, wide, tall)
      ctx.fillStyle = labelLook.bg
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.lineWidth = 1
      ctx.strokeStyle = labelLook.border
      ctx.stroke()
      ctx.fillStyle = labelLook.fg
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(icon.tech.name, left + wide / 2, top + tall / 2 + 0.5)
      ctx.restore()
    }

    /* ---- Loop: runs only while the stage is on screen ---- */
    let frame = 0
    let last = 0
    let acc = 0
    let visible = false
    const tick = (now) => {
      frame = requestAnimationFrame(tick)
      if (!visible) {
        last = now
        return
      }
      if (mode === 'entering') {
        enter(now)
        last = now
        draw()
        return
      }
      // Capped, so returning to the tab does not replay seconds of motion.
      acc += Math.min(now - (last || now), 250)
      last = now
      while (acc >= STEP) {
        step()
        acc -= STEP
      }
      draw(acc / STEP)
    }

    const seen = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
      },
      { rootMargin: '120px' }
    )
    // The entrance waits until the section is well into view.
    const entrance = new IntersectionObserver(
      (entries) => {
        if (mode === 'waiting' && entries.some((e) => e.isIntersecting)) {
          mode = 'entering'
          enterAt = performance.now()
          entrance.disconnect()
        }
      },
      { rootMargin: '0px 0px -40% 0px', threshold: 0.1 }
    )

    /* ---- Pointer ---- */
    const toStage = (clientX, clientY) => {
      const r = wrap.getBoundingClientRect()
      pointer.x = clientX - r.left - r.width / 2
      pointer.y = clientY - r.top - r.height / 2
    }
    /** The icon nearest (x, y) among those within `reach` of it, if any. */
    const iconAt = (x, y, reach) => {
      let best = null
      let bestD = reach
      for (const icon of icons) {
        const d = Math.hypot(icon.x - x, icon.y - y)
        if (d <= bestD) {
          best = icon
          bestD = d
        }
      }
      return best
    }
    // Most of the tile for a cursor; a fingertip is blunter.
    const reach = () => view.size * (touch ? 0.66 : 0.55)
    let reportedAt = -Infinity

    /**
     * Icons the pointer has just touched join the chain at its head, and the
     * last of them is named. A stroke's first point (a tap, or the pointer
     * coming in) takes just the icon under it; after that the whole stroke
     * since the last event counts (`from` to here), so a fast sweep misses
     * none.
     */
    const collect = (from) => {
      if (mode !== 'idle') return
      const r = reach()
      const hits = []
      if (!from) {
        const i = icons.indexOf(iconAt(pointer.x, pointer.y, r))
        if (i >= 0 && !order.includes(i)) hits.push(i)
      } else {
        const dx = pointer.x - from.x
        const dy = pointer.y - from.y
        const len2 = dx * dx + dy * dy || 1
        const passed = []
        icons.forEach((icon, i) => {
          if (order.includes(i)) return
          // Where along the stroke it came closest to this icon, and how close.
          const t = clamp01(((icon.x - from.x) * dx + (icon.y - from.y) * dy) / len2)
          const d = Math.hypot(icon.x - (from.x + dx * t), icon.y - (from.y + dy * t))
          if (d <= r) passed.push([t, d, i])
        })
        // In the order they were crossed (at a tie, the nearer one last), so
        // the last one touched leads.
        passed.sort((a, b) => a[0] - b[0] || b[1] - a[1])
        for (const [, , i] of passed) hits.push(i)
      }
      if (!hits.length) return
      for (const i of hits) order.unshift(i)
      const head = icons[order[0]]
      const now = performance.now()
      if (label.icon !== head) label.born = now
      label.icon = head
      label.until = Infinity
      // The icon leading the chain is the one being played with; a quick
      // sweep reports once, so the samurai is not set nodding at each icon.
      if (now - reportedAt > 700) {
        reportedAt = now
        reportSkill(head.tech.group)
      }
    }

    const gather = (clientX, clientY, hintKey) => {
      const from = pointer.active ? { x: pointer.x, y: pointer.y } : null
      toStage(clientX, clientY)
      // Just sent home with a click: wait for a deliberate move, so a hand's
      // tremor does not pull them straight back out.
      if (pointer.heldAt) {
        if (Math.hypot(pointer.x - pointer.heldAt.x, pointer.y - pointer.heldAt.y) < REGATHER) return
        pointer.heldAt = null
      }
      pointer.active = true
      collect(from)
      // Nothing to send home until something has been picked up.
      if (order.length) showHint(hintKey)
    }
    const sendHome = () => {
      pointer.active = false
      trail.length = 0
      order = []
      for (const icon of icons) icon.chained = false
      // The name stays a moment with its icon as it glides home.
      if (label.icon && label.until === Infinity) {
        label.until = performance.now() + (touch ? LINGER_TAP : LINGER)
      }
      showHint(touch ? 'gatherTouch' : 'gather')
    }

    // A tap is followed by the mouse events a mouse would send; those are
    // ignored, so a tap is handled once, as a touch.
    let touchedAt = -Infinity
    const byTouch = () => performance.now() - touchedAt < 800
    const onClick = () => {
      if (byTouch()) return
      sendHome()
      pointer.heldAt = { x: pointer.x, y: pointer.y }
    }
    const onLeave = () => {
      sendHome()
      pointer.heldAt = null
    }
    const onMouseMove = (e) => {
      if (!byTouch()) gather(e.clientX, e.clientY, 'home')
    }
    const onTouchMove = (e) => {
      touchedAt = performance.now()
      const t = e.touches[0]
      if (t) gather(t.clientX, t.clientY, 'homeTouch')
    }
    // Each touch is a stroke of its own, wherever the last one ended.
    const onTouchStart = (e) => {
      pointer.active = false
      onTouchMove(e)
    }
    const onTouchEnd = () => {
      touchedAt = performance.now()
      onLeave()
    }

    // With reduced motion nothing moves and no loop runs: pointing at an
    // icon (or tapping it) just shows its name, drawn on the spot.
    let stillTimer = 0
    const nameStill = (icon) => {
      if (icon === label.icon) return
      label.icon = icon
      label.born = 0
      label.until = Infinity
      draw()
    }
    const onStillMove = (e) => {
      toStage(e.clientX, e.clientY)
      nameStill(iconAt(pointer.x, pointer.y, reach()))
    }
    const onStillLeave = () => nameStill(null)
    const onStillTouch = (e) => {
      const t = e.touches[0]
      if (!t) return
      toStage(t.clientX, t.clientY)
      nameStill(iconAt(pointer.x, pointer.y, reach()))
      clearTimeout(stillTimer)
      stillTimer = setTimeout(() => nameStill(null), LINGER_TAP)
    }

    const resizeWatcher = new ResizeObserver(layout)
    const themeWatcher = new MutationObserver(paintTiles)

    layout()
    resizeWatcher.observe(wrap)
    resizeWatcher.observe(center)
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    if (!still) {
      seen.observe(wrap)
      entrance.observe(wrap)
      wrap.addEventListener('mousemove', onMouseMove)
      wrap.addEventListener('mouseleave', onLeave)
      wrap.addEventListener('click', onClick)
      wrap.addEventListener('touchstart', onTouchStart, { passive: true })
      wrap.addEventListener('touchmove', onTouchMove, { passive: true })
      wrap.addEventListener('touchend', onTouchEnd)
      wrap.addEventListener('touchcancel', onTouchEnd)
      frame = requestAnimationFrame(tick)
    } else {
      wrap.addEventListener('mousemove', onStillMove)
      wrap.addEventListener('mouseleave', onStillLeave)
      wrap.addEventListener('touchstart', onStillTouch, { passive: true })
    }

    return () => {
      destroyed = true
      cancelAnimationFrame(frame)
      clearTimeout(stillTimer)
      wrap.removeEventListener('mousemove', onStillMove)
      wrap.removeEventListener('mouseleave', onStillLeave)
      wrap.removeEventListener('touchstart', onStillTouch)
      seen.disconnect()
      entrance.disconnect()
      resizeWatcher.disconnect()
      themeWatcher.disconnect()
      wrap.removeEventListener('mousemove', onMouseMove)
      wrap.removeEventListener('mouseleave', onLeave)
      wrap.removeEventListener('click', onClick)
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [centerRef])

  return (
    <div className="skills-swarm" ref={wrapRef} aria-hidden="true">
      {/* Source SVGs for the tiles — rendered, read, never seen. */}
      <div className="icon-source" ref={sourceRef}>
        {TECH.map(({ name, Icon }) => (
          <Icon key={name} />
        ))}
      </div>
      <canvas ref={canvasRef} />
      {hint && (
        <span className={`skills-hint ${hint.startsWith('home') ? 'on' : ''}`}>{HINTS[hint]}</span>
      )}
    </div>
  )
}
