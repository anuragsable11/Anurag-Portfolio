/**
 * The all-projects page: every project as a cover on a Fibonacci sphere you
 * can turn, with the Projects title floating at its centre. Scrolling the
 * page's short track dollies the camera in; a flat grid and a lightbox show
 * each project on its own.
 *
 * Plain DOM, no framework. The projects come from the same data file as the
 * portfolio, so the two pages never disagree.
 */
import { navLinks, profile, projects, projectsHead } from '../data/content.js'

const $ = (sel) => document.querySelector(sel)
const root = document.documentElement
const body = document.body
const stage = $('#stage')
const world = $('#world')
const orb = $('#orb')
const headline = $('#headline')
const gridEl = $('#grid')
const rows = $('#grid .rows')
const gridBtn = $('#gridBtn')
const menuBtn = $('#menuBtn')
const menu = $('#menu')
const lit = $('#lit')
const plate = $('#lit .plate')
const litImg = $('#litImg')
const splash = $('#splash')
const bar = $('#bar')
const dot = $('#dot')

const DEG = Math.PI / 180
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
const coarse = matchMedia('(pointer: coarse)')

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...[].concat(children))
  return node
}

/* ---- Words: all the portfolio's own ---- */
const inner = headline.querySelector('.inner')
const words = `${projectsHead.title} ${projectsHead.highlight}`.split(/\s+/)
words.forEach((word, i) => {
  if (i) inner.append(' ')
  const span = el('span', { textContent: word })
  span.style.setProperty('--i', i)
  inner.append(span)
})
$('#bioText').textContent = projectsHead.sub
$('#colophon').textContent = profile.role
$('#splashTag').textContent = projectsHead.eyebrow

const label = (id) => navLinks.find((l) => l.id === id)?.label ?? id
const menuLinks = [
  { text: `All ${projectsHead.eyebrow.toLowerCase()}`, href: '#grid', grid: true },
  { text: label('home'), href: '/' },
  { text: 'GitHub', href: profile.github, external: true },
  { text: label('contact'), href: '/#contact' },
]
$('#menuNav').append(
  ...menuLinks.map((m) => {
    const a = el('a', { href: m.href, textContent: m.text })
    if (m.grid) a.dataset.grid = ''
    if (m.external) Object.assign(a, { target: '_blank', rel: 'noopener noreferrer' })
    return a
  })
)
$('#menuAddr').append(
  profile.location,
  el('br'),
  el('a', { href: `mailto:${profile.email}`, textContent: profile.email })
)

/* ---- The covers on a Fibonacci sphere ---- */
const list = projects.filter((p) => p.showcase)
// The sphere reads best with around twenty covers, so each project takes a
// few places on it; the golden-angle spiral keeps a project's copies far apart.
const N = Math.min(list.length * Math.max(1, Math.ceil(18 / list.length)), 30)
const GA = Math.PI * (3 - Math.sqrt(5))
const cards = []
for (let i = 0; i < N; i++) {
  const y = N > 1 ? 1 - (i / (N - 1)) * 2 : 0
  const rad = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = i * GA
  const x = Math.cos(theta) * rad
  const z = Math.sin(theta) * rad
  const pi = i % list.length
  const img = el('img', { alt: '', decoding: 'async', draggable: false, src: list[pi].showcase.imageSmall })
  const node = el('div', { className: 'card' }, el('figure', {}, img))
  node.dataset.idx = i
  orb.append(node)
  cards.push({ node, img, pi, x, y, z, lat: Math.asin(y) / DEG, lon: Math.atan2(x, z) / DEG, d: -1, o: -1 })
}

/* ---- The flat grid: each project once ---- */
list.forEach((p, pi) => {
  const fig = el('figure', { tabIndex: 0 }, [
    el(
      'div',
      { className: 'thumb' },
      el('img', { src: p.showcase.imageSmall, alt: p.showcase.alt, loading: 'lazy', decoding: 'async' })
    ),
    el('figcaption', {}, [
      el('b', { textContent: p.name }),
      el('span', { textContent: `${p.category} · ${p.year}` }),
    ]),
  ])
  fig.setAttribute('role', 'button')
  fig.setAttribute('aria-label', `${p.name}, ${p.subtitle}. Open details`)
  fig.dataset.p = pi
  rows.append(fig)
})

/* ---- Layout: radius, cover size and perspective from the viewport ---- */
let R = 300
let persp = 1150
let lastW = 0
let lastH = 0
function layout(force = false) {
  const w = innerWidth
  const h = innerHeight
  // Scrollbars and mobile URL bars nudge the size; ignore those.
  if (!force && Math.abs(w - lastW) < 20 && Math.abs(h - lastH) < 20) return
  lastW = w
  lastH = h
  const hr = w <= 380 ? 0.38 : w <= 640 ? 0.42 : 0.46
  // A phone is tall: let the sphere use more of its width (covers may run
  // just past the edges, as they do on a desktop).
  const wr = w <= 380 ? 0.56 : 0.58
  const floor = w <= 380 ? 108 : w <= 640 ? 120 : 155
  R = Math.max(floor, Math.min(480, h * hr, w * wr))
  // Sized for 21 covers; fewer covers each get a little more room.
  const scale = (w <= 380 ? 0.44 : w <= 640 ? 0.46 : 0.47) * Math.sqrt(21 / N)
  const cw = Math.round(Math.max(72, R * scale))
  persp = w <= 380 ? 620 : w <= 640 ? 760 : w <= 900 ? 920 : 1150
  root.style.setProperty('--persp', `${persp}px`)
  root.style.setProperty('--cw', `${cw}px`)
  for (const c of cards) {
    c.node.style.transform = `translate3d(${c.x * R}px, ${-c.y * R}px, ${c.z * R}px) rotateY(${c.lon}deg) rotateX(${c.lat}deg)`
  }
}
addEventListener('resize', () => layout())
addEventListener('orientationchange', () => setTimeout(() => layout(true), 220))
visualViewport?.addEventListener('resize', () => layout())
visualViewport?.addEventListener('scroll', () => layout())

/* ---- The camera: drag momentum, the scroll dolly, depth ---- */
const cam = { spin: 0, tilt: -4, camZ: 0, dragX: 0, dragY: 0, velX: 0, velY: 0 }
const PITCH = 32
let focused = -1
let dragging = false
let deep = null

function frame() {
  const isLit = body.classList.contains('lit')
  // No spin of its own: it only carries what a drag gave it, and holds
  // still while a project is open.
  if (!dragging && !isLit) {
    cam.dragX += cam.velX
    cam.dragY += cam.velY
    cam.velX *= 0.94
    cam.velY *= 0.94
    if (Math.abs(cam.velX) < 0.002) cam.velX = 0
    if (Math.abs(cam.velY) < 0.002) cam.velY = 0
  }
  cam.dragY = clamp(cam.dragY, -PITCH - cam.tilt, PITCH - cam.tilt)

  const p = clamp(scrollY / (innerHeight * 0.16), 0, 1)
  // Forward only, and never through the sphere.
  cam.camZ += (p * Math.min(64, R * 0.12) - cam.camZ) * 0.075

  const sx = cam.tilt + cam.dragY
  const sy = cam.spin + cam.dragX
  world.style.transform = `translateZ(${cam.camZ}px) rotateY(${sy}deg) rotateX(${sx}deg)`
  // Undo the world's turn, then step toward the camera: the title stays
  // square to the viewer on the sphere's centre, and only the nearest
  // covers pass in front of it.
  headline.style.transform = `rotateX(${-sx}deg) rotateY(${-sy}deg) translateZ(${R * 0.62}px)`
  headline.style.opacity = isLit ? '0' : String(Math.max(0, 1 - p * 0.55))

  const isDeep = p > 0.5
  if (isDeep !== deep) {
    deep = isDeep
    body.classList.toggle('deep', deep)
  }

  // Each cover's depth once the world has turned: far ones sink into black.
  const cx = Math.cos(sx * DEG)
  const snx = Math.sin(sx * DEG)
  const cy = Math.cos(sy * DEG)
  const sny = Math.sin(sy * DEG)
  const shade = 1 - Math.min(1, p * 1.6)
  const near = persp * 0.66
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const z1 = -c.y * snx + c.z * cx
    const zf = -c.x * sny + z1 * cy
    const base = 0.14 + 0.86 * ((zf + 1) / 2) ** 0.85
    let dim = shade * (1 - base)
    let fade = 1
    const absZ = zf * R + cam.camZ
    if (absZ > near) fade = Math.max(0, 1 - (absZ - near) / 190)
    if (isLit) {
      dim = Math.min(1, dim + 0.78)
      // The lightbox plate stands in for the cover it came from.
      if (i === focused) fade = 0
    }
    const d = Math.round(dim * 1000) / 1000
    const o = Math.round(fade * 1000) / 1000
    if (d !== c.d) {
      c.node.style.setProperty('--d', d)
      c.d = d
    }
    if (o !== c.o) {
      c.node.style.opacity = o
      c.o = o
    }
  }
  requestAnimationFrame(frame)
}

/* ---- Drag to turn ---- */
let drag = null
stage.addEventListener('pointerdown', (e) => {
  if (body.classList.contains('lit') || e.button > 0) return
  drag = {
    id: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    lx: e.clientX,
    ly: e.clientY,
    at: performance.now(),
    moved: 0,
    // Read before pointer capture retargets the events.
    card: e.target.closest('.card'),
    // Mouse and pen turn at once; a finger has to show it means sideways.
    live: e.pointerType !== 'touch',
    off: false,
  }
  cam.velX = cam.velY = 0
  if (drag.live) {
    dragging = true
    stage.setPointerCapture(e.pointerId)
  }
})

stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || drag.off) return
  const tx = e.clientX - drag.x0
  const ty = e.clientY - drag.y0
  drag.moved = Math.max(drag.moved, Math.hypot(tx, ty))
  if (!drag.live) {
    if (Math.hypot(tx, ty) < 10) return
    // Mostly vertical: a scroll, so let the page have it.
    if (Math.abs(ty) > Math.abs(tx) * 1.15) {
      drag.off = true
      return
    }
    drag.live = true
    dragging = true
    try {
      stage.setPointerCapture(e.pointerId)
    } catch {
      /* the browser already took the gesture */
    }
  }
  const mx = e.clientX - drag.lx
  const my = e.clientY - drag.ly
  drag.lx = e.clientX
  drag.ly = e.clientY
  drag.at = performance.now()
  cam.dragX += mx * 0.13
  cam.dragY -= my * 0.13
  cam.velX = mx * 0.13
  cam.velY = -my * 0.13
})

function endDrag(e, cancelled) {
  if (!drag || e.pointerId !== drag.id) return
  const slop = coarse.matches ? 14 : 6
  const card = !cancelled && !drag.off && drag.moved < slop ? drag.card : null
  // Held still before letting go: no fling.
  if (performance.now() - drag.at > 90) cam.velX = cam.velY = 0
  dragging = false
  drag = null
  if (card) {
    const i = Number(card.dataset.idx)
    openShot(cards[i].pi, card, i)
  }
}
stage.addEventListener('pointerup', (e) => endDrag(e, false))
stage.addEventListener('pointercancel', (e) => endDrag(e, true))

// The track is only 16vh long; never let a bounce carry past it.
addEventListener(
  'scroll',
  () => {
    const max = innerHeight * 0.16
    if (scrollY > max + 1) scrollTo(0, max)
  },
  { passive: true }
)

/* ---- The lightbox ---- */
const litTitle = $('#litTitle')
const litWhere = $('#litWhere')
const litNote = $('#litNote')
const litStack = $('#litStack')
const litLinks = $('#litLinks')
const closeBtn = $('#lit .close')
let token = 0
let litFrom = null
let litReturn = null

function linksFor(p) {
  const out = []
  const add = (href, text, aria) => {
    const a = el('a', { href, textContent: text, target: '_blank', rel: 'noopener noreferrer' })
    a.setAttribute('aria-label', aria)
    out.push(a)
  }
  if (p.links?.live) add(p.links.live, 'Live ↗', `${p.name} live demo (opens in a new tab)`)
  if (p.links?.github) add(p.links.github, 'Code ↗', `${p.name} source code on GitHub (opens in a new tab)`)
  return out
}

/** Where `from` sits relative to the plate, as a transform. */
function offsetFrom(from) {
  const to = plate.getBoundingClientRect()
  const r = from?.getBoundingClientRect()
  if (!r || !r.width || !to.width) return null
  const dx = r.left + r.width / 2 - (to.left + to.width / 2)
  const dy = r.top + r.height / 2 - (to.top + to.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${Math.max(0.04, r.width / to.width)})`
}

function openShot(pi, from, cardIdx = -1) {
  const p = list[pi]
  const { showcase } = p
  const mine = ++token
  litFrom = from
  litReturn = document.activeElement
  focused = cardIdx

  plate.style.setProperty('--sar', (showcase.width / showcase.height).toFixed(4))
  // The cover already on screen first; the full-size shot once it has loaded.
  litImg.src = showcase.imageSmall
  litImg.alt = showcase.alt
  const full = new Image()
  full.onload = () => {
    if (mine === token) litImg.src = showcase.image
  }
  full.src = showcase.image
  litTitle.textContent = p.name
  litWhere.textContent = `${p.subtitle} · ${p.year}`
  litNote.textContent = p.summary
  litStack.textContent = p.stack.join(' · ')
  litLinks.replaceChildren(...linksFor(p))

  body.classList.add('lit')
  lit.inert = false
  lit.setAttribute('aria-hidden', 'false')
  body.style.overflow = 'hidden'

  // FLIP: start the plate on the cover it came from, then let it fly home.
  const start = offsetFrom(from)
  if (start) {
    plate.style.transition = 'none'
    plate.style.transform = start
    plate.style.opacity = '0'
    void plate.offsetWidth
    plate.style.transition = ''
    plate.style.transform = ''
    plate.style.opacity = ''
  }
  closeBtn.focus({ preventScroll: true })
}

function closeShot() {
  if (!body.classList.contains('lit')) return
  token++
  focused = -1
  body.classList.remove('lit')
  lit.inert = true
  lit.setAttribute('aria-hidden', 'true')
  const back = offsetFrom(litFrom)
  if (back) plate.style.transform = back
  plate.style.opacity = '0'
  setTimeout(() => {
    if (body.classList.contains('lit')) return
    plate.style.transition = 'none'
    plate.style.transform = ''
    plate.style.opacity = ''
    void plate.offsetWidth
    plate.style.transition = ''
  }, 640)
  if (!body.classList.contains('locked')) body.style.overflow = ''
  litReturn?.focus?.({ preventScroll: true })
}

lit.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeShot()
})

/* ---- Grid view ---- */
function setGrid(on) {
  body.classList.toggle('gridview', on)
  gridBtn.setAttribute('aria-pressed', String(on))
  gridEl.inert = !on
  if (on) gridEl.scrollTop = 0
}
gridBtn.addEventListener('click', () => setGrid(!body.classList.contains('gridview')))
rows.addEventListener('click', (e) => {
  const fig = e.target.closest('figure')
  if (fig) openShot(Number(fig.dataset.p), fig)
})
rows.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('figure')) {
    e.preventDefault()
    openShot(Number(e.target.dataset.p), e.target)
  }
})

/* ---- Menu ---- */
function setMenu(open) {
  body.classList.toggle('menu-open', open)
  menuBtn.setAttribute('aria-expanded', String(open))
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  menu.setAttribute('aria-hidden', String(!open))
  menu.inert = !open
}
menuBtn.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')))
menu.addEventListener('click', (e) => {
  const a = e.target.closest('a')
  if (!a) return
  if ('grid' in a.dataset) {
    e.preventDefault()
    setGrid(true)
  }
  setMenu(false)
})

// Esc closes the lightbox first, then the menu, then the grid.
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (body.classList.contains('lit')) closeShot()
  else if (body.classList.contains('menu-open')) setMenu(false)
  else if (body.classList.contains('gridview')) setGrid(false)
})

lit.inert = true
menu.inert = true
gridEl.inert = true

/* ---- The cursor dot, for fine pointers only ---- */
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let tx = 0
  let ty = 0
  let x = 0
  let y = 0
  let seen = false
  addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX
      ty = e.clientY
      if (!seen) {
        x = tx
        y = ty
        seen = true
      }
      dot.classList.add('on')
      const t = e.target
      dot.classList.toggle('wide', t instanceof Element && !!t.closest('.card, a, button, #grid figure'))
    },
    { passive: true }
  )
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) dot.classList.remove('on')
  })
  const follow = () => {
    x += (tx - x) * 0.2
    y += (ty - y) * 0.2
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`
    requestAnimationFrame(follow)
  }
  follow()
}

/* ---- Splash: hold until the covers are in, then reveal ---- */
const born = performance.now()
let loaded = 0
let splashDone = false

function reveal() {
  body.classList.remove('locked')
  // Measure with the scrollbar settled, then again a frame later.
  layout(true)
  requestAnimationFrame(() => {
    layout(true)
    body.classList.add('revealed')
  })
}

function endSplash() {
  if (splashDone) return
  splashDone = true
  setTimeout(() => {
    bar.style.transform = 'scaleX(1)'
    setTimeout(() => {
      splash.classList.add('out')
      reveal()
      setTimeout(() => splash.remove(), 950)
    }, 350)
  }, Math.max(0, 1150 - (performance.now() - born)))
}

list.forEach((p, pi) => {
  const probe = new Image()
  probe.decoding = 'async'
  probe.src = p.showcase.imageSmall
  const done = () => {
    loaded++
    bar.style.transform = `scaleX(${loaded / list.length})`
    for (const c of cards) if (c.pi === pi) c.img.classList.add('in')
    if (loaded >= list.length) endSplash()
  }
  probe.decode().then(done, done)
})
if (!list.length) endSplash()
setTimeout(endSplash, 9000)

// The sphere is full size and turning before the splash lifts, so the first
// frame anyone sees does not jump.
layout(true)
frame()
