import { useEffect, useRef, useState } from 'react'
import { TECH } from '../data/tech.js'
import { prefersReducedMotion } from '../lib/capabilities.js'
import { reportSkill } from '../lib/companion.js'

/**
 * The tech stack as app-icon tiles scattered around the section title.
 *
 * Drawn on a 2D canvas; a couple of dozen sprites need nothing heavier.
 *  - Entrance: when the section scrolls into view, the icons burst out from
 *    behind the title one after another, overshooting to 1.5× before they
 *    settle on their spots.
 *  - Cursor: move through the section and the icons nearest the pointer
 *    string out behind it, each one tracing the path the pointer took a few
 *    frames before the one ahead of it. Leave, and they stay where you left
 *    them; click (or lift a finger) and they spring home, where they keep
 *    drifting a few pixels either way.
 */

// Entrance, in milliseconds
const STAGGER = 75
const POP = 500

// The simulation steps at a fixed 60 Hz, so it feels the same on any display.
const STEP = 1000 / 60
const SPRING = 0.08
const DAMPING = 0.82
// Pointer trail: positions remembered, steps between neighbouring icons, and
// how quickly each icon closes on its point.
const TRAIL = 160
const SPACING = 7
const FOLLOW = 0.14
// Once home, every icon picks a new resting spot this far off, this often.
const WANDER = 10
const WANDER_EVERY = 2000

const lerp = (a, b, t) => a + (b - a) * t
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2

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

// What to try next, by input: `home` hints show while the icons are away.
const HINTS = {
  gather: 'Move through the stack',
  gatherTouch: 'Drag a finger across the stack',
  home: 'Click to send them home',
  homeTouch: 'Let go to send them home',
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

    const icons = TECH.map((tech) => ({
      tech,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      homeX: 0,
      homeY: 0,
      restX: 0,
      restY: 0,
      scale: still ? 1 : 0,
      tile: null,
    }))
    const view = { w: 0, h: 0, ratio: 1, size: 0 }
    const pointer = { x: 0, y: 0, active: false }
    const trail = []
    let order = []
    // waiting → entering → idle. Once idle, the icons either trail the
    // pointer, spring home (`returning`), or stay put where they were left.
    let mode = still ? 'idle' : 'waiting'
    let returning = false
    let enterAt = 0
    let wanderClock = 0
    let destroyed = false

    /* ---- Tiles, repainted when the size or the theme changes ---- */
    let paintJob = 0
    const paintTiles = async () => {
      const job = ++paintJob
      const dark = document.documentElement.dataset.theme === 'dark'
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
      const size = w < 640 ? 60 : 80
      const resized = size !== view.size
      Object.assign(view, { w, h, ratio, size })

      // Keep clear of the title and of the hint along the bottom edge.
      const stage = wrap.getBoundingClientRect()
      const title = center.getBoundingClientRect()
      const clear = size * 0.55 + 8
      const margin = size * 0.62
      const spots = scatter(icons.length, Math.min(w / 2 - margin, 820), h / 2 - margin, [
        {
          x: title.left + title.width / 2 - (stage.left + w / 2),
          y: title.top + title.height / 2 - (stage.top + h / 2),
          hw: title.width / 2 + clear,
          hh: title.height / 2 + clear,
        },
        { x: 0, y: h / 2 - 36, hw: 120 + clear, hh: 14 + clear },
      ])
      icons.forEach((icon, i) => {
        icon.homeX = icon.restX = spots[i].x
        icon.homeY = icon.restY = spots[i].y
        if (still) {
          icon.x = icon.homeX
          icon.y = icon.homeY
        }
      })
      // Settled icons follow their spots to the new layout.
      if (mode === 'idle' && !pointer.active) returning = true

      if (resized) paintTiles()
      draw()
    }

    /* ---- Simulation ---- */
    const step = (now) => {
      if (mode === 'entering') {
        const elapsed = now - enterAt
        let done = true
        icons.forEach((icon, i) => {
          const t = (elapsed - i * STAGGER) / POP
          if (t < 0) {
            done = false
            return
          }
          const k = Math.min(t, 1)
          if (k < 1) done = false
          const e = easeOutBack(k)
          icon.x = icon.homeX * e
          icon.y = icon.homeY * e
          icon.scale = k < 0.5 ? lerp(0, 1.5, k * 2) : lerp(1.5, 1, (k - 0.5) * 2)
        })
        if (done) {
          mode = 'idle'
          icons.forEach((icon) => {
            icon.x = icon.restX = icon.homeX
            icon.y = icon.restY = icon.homeY
            icon.scale = 1
            icon.vx = icon.vy = 0
          })
        }
        return
      }
      if (mode !== 'idle') return

      if (pointer.active && !returning) {
        trail.push({ x: pointer.x, y: pointer.y })
        if (trail.length > TRAIL) trail.shift()
        // The chain forms nearest-first, fixed when the pointer arrives.
        if (!order.length) {
          order = icons
            .map((icon, i) => [i, Math.hypot(icon.x - pointer.x, icon.y - pointer.y)])
            .sort((a, b) => a[1] - b[1])
            .map(([i]) => i)
          // The icon leading the chain is the one being played with.
          reportSkill(icons[order[0]]?.tech.group)
        }
        order.forEach((i, k) => {
          const at = trail.length - 1 - k * SPACING
          if (at < 0) return
          const icon = icons[i]
          icon.x = lerp(icon.x, trail[at].x, FOLLOW)
          icon.y = lerp(icon.y, trail[at].y, FOLLOW)
          icon.vx = icon.vy = 0
        })
      } else if (returning) {
        for (const icon of icons) {
          icon.vx = (icon.vx + (icon.restX - icon.x) * SPRING) * DAMPING
          icon.vy = (icon.vy + (icon.restY - icon.y) * SPRING) * DAMPING
          icon.x += icon.vx
          icon.y += icon.vy
        }
        wanderClock += STEP
        if (wanderClock > WANDER_EVERY) {
          wanderClock = 0
          for (const icon of icons) {
            icon.restX = icon.homeX + (Math.random() * 2 - 1) * WANDER
            icon.restY = icon.homeY + (Math.random() * 2 - 1) * WANDER
          }
        }
      }
    }

    const draw = () => {
      const { w, h, ratio } = view
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(ratio, 0, 0, ratio, (w / 2) * ratio, (h / 2) * ratio)
      for (const icon of icons) {
        if (icon.scale <= 0 || !icon.tile) continue
        const d = icon.tile.full * icon.scale
        ctx.drawImage(icon.tile.canvas, icon.x - d / 2, icon.y - d / 2, d, d)
      }
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
      // Capped, so returning to the tab does not replay seconds of motion.
      acc += Math.min(now - (last || now), 250)
      last = now
      while (acc >= STEP) {
        step(now)
        acc -= STEP
      }
      draw()
    }

    const seen = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
      },
      { rootMargin: '120px' }
    )
    // The burst waits until the section is well into view.
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
    const gather = (clientX, clientY, hintKey) => {
      toStage(clientX, clientY)
      pointer.active = true
      returning = false
      showHint(hintKey)
    }
    const release = () => {
      pointer.active = false
      trail.length = 0
      order = []
    }
    const sendHome = () => {
      release()
      returning = true
      showHint(touch ? 'gatherTouch' : 'gather')
    }
    const onMouseMove = (e) => gather(e.clientX, e.clientY, 'home')
    const onTouchMove = (e) => {
      const t = e.touches[0]
      if (t) gather(t.clientX, t.clientY, 'homeTouch')
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
      wrap.addEventListener('mouseleave', release)
      wrap.addEventListener('click', sendHome)
      wrap.addEventListener('touchstart', onTouchMove, { passive: true })
      wrap.addEventListener('touchmove', onTouchMove, { passive: true })
      wrap.addEventListener('touchend', sendHome)
      frame = requestAnimationFrame(tick)
    }

    return () => {
      destroyed = true
      cancelAnimationFrame(frame)
      seen.disconnect()
      entrance.disconnect()
      resizeWatcher.disconnect()
      themeWatcher.disconnect()
      wrap.removeEventListener('mousemove', onMouseMove)
      wrap.removeEventListener('mouseleave', release)
      wrap.removeEventListener('click', sendHome)
      wrap.removeEventListener('touchstart', onTouchMove)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', sendHome)
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
