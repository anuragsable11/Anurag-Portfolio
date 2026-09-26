/**
 * Samurai emote set — five chibi stickers drawn from one shared character.
 *
 *   node emotes/generate.mjs        writes emotes/svg/<name>.svg
 *
 * The PNGs in emotes/png were rendered from these SVGs in headless Chrome
 * with a transparent background: 1024 and 512 for stickers, 128 for Discord,
 * and 112 / 56 / 28 for Twitch. Re-render them after editing the SVGs.
 *
 * Everything is plain SVG built from the same parts (helmet, face, armour,
 * arms, katana), so the five stay consistent: only the face, the arms, the
 * katana's pose and the effects change. The sticker border is a filter on a
 * copy of the art: the silhouette is blurred and thresholded, which grows it
 * with rounded corners, then filled white over a thin ink rim and a soft
 * shadow. Coordinates are on a 512 × 512 canvas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'svg')

/* ================================================================
   Palette and drawing helpers
   ================================================================ */
const INK = '#2a1810'
const W = 7 // outline width

const C = {
  navy: '#343c60',
  red: '#d8323a',
  gold: '#f6b92f',
  goldBright: '#ffd65a',
  wrap: '#26262e',
  foot: '#2b2530',
  skin: '#ffd6b3',
  blush: '#ff7f86',
  tongue: '#ff7c86',
  tear: '#8fd6ff',
}

const r2 = (n) => Math.round(n * 100) / 100
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

const shape = (d, fill, extra = {}) =>
  `<path ${attrs({ d, fill, stroke: INK, 'stroke-width': W, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra })}/>`
const stroke = (d, color = INK, width = W, extra = {}) =>
  `<path ${attrs({ d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra })}/>`
const ellipse = (cx, cy, rx, ry, fill, extra = {}) =>
  `<ellipse ${attrs({ cx, cy, rx, ry, fill, stroke: INK, 'stroke-width': W, ...extra })}/>`
const circle = (cx, cy, r, fill, extra = {}) =>
  `<circle ${attrs({ cx, cy, r, fill, stroke: INK, 'stroke-width': W, ...extra })}/>`
/** A limb or cord: a thick stroke with an ink edge of width W on each side. */
const tube = (d, width, color) => stroke(d, INK, width + W * 2) + stroke(d, color, width)
const group = (transform, body) => `<g transform="${transform}">${body}</g>`
/** Draws `body` a second time mirrored across the centre line. */
const mirrored = (body) => body + group('matrix(-1 0 0 1 512 0)', body)

let uid = 0
const nextId = (p) => `${p}${++uid}`

/* ================================================================
   Gradients and the sticker filter
   ================================================================ */
const DEFS = `
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ff6a5f"/><stop offset="0.45" stop-color="#e2363c"/><stop offset="1" stop-color="#a51d2a"/>
</linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff4a8"/><stop offset="0.42" stop-color="#f8c233"/><stop offset="1" stop-color="#c47c0e"/>
</linearGradient>
<linearGradient id="goldSide" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#c47c0e"/><stop offset="0.3" stop-color="#ffe98a"/><stop offset="0.55" stop-color="#f6b92f"/><stop offset="1" stop-color="#b56f0b"/>
</linearGradient>
<radialGradient id="cream" cx="0.34" cy="0.28" r="0.85">
  <stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#f6eedc"/><stop offset="1" stop-color="#c8b48f"/>
</radialGradient>
<radialGradient id="skin" cx="0.4" cy="0.36" r="0.78">
  <stop offset="0" stop-color="#ffece0"/><stop offset="0.55" stop-color="#ffd6b3"/><stop offset="1" stop-color="#eeaa82"/>
</radialGradient>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#8391a6"/><stop offset="0.35" stop-color="#f6f9fd"/><stop offset="0.6" stop-color="#d7e1ec"/><stop offset="1" stop-color="#9aa9bc"/>
</linearGradient>
<linearGradient id="tear" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#d4f3ff"/><stop offset="1" stop-color="#3f9fe8"/>
</linearGradient>
<linearGradient id="mouth" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#4f1116"/><stop offset="1" stop-color="#8e2228"/>
</linearGradient>
<radialGradient id="rage" cx="0.5" cy="0.3" r="0.75">
  <stop offset="0" stop-color="#ff3b2e" stop-opacity="0.92"/><stop offset="0.7" stop-color="#ff5a45" stop-opacity="0.7"/><stop offset="1" stop-color="#d7261c" stop-opacity="0.8"/>
</radialGradient>
<linearGradient id="pale" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5f7de0" stop-opacity="0.8"/><stop offset="0.5" stop-color="#8aa2f0" stop-opacity="0.18"/><stop offset="0.62" stop-color="#8aa2f0" stop-opacity="0"/>
</linearGradient>
<linearGradient id="gloom" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7a86d8" stop-opacity="0.55"/><stop offset="0.45" stop-color="#7a86d8" stop-opacity="0"/>
</linearGradient>
<filter id="sticker" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur"/>
  <feComponentTransfer in="blur" result="whiteA"><feFuncA type="linear" slope="24" intercept="-1.3"/></feComponentTransfer>
  <feComponentTransfer in="blur" result="rimA"><feFuncA type="linear" slope="24" intercept="-0.45"/></feComponentTransfer>
  <feGaussianBlur in="rimA" stdDeviation="5" result="soft"/>
  <feOffset in="soft" dy="6" result="drop"/>
  <feFlood flood-color="#000" flood-opacity="0.35"/><feComposite in2="drop" operator="in" result="shadow"/>
  <feFlood flood-color="${INK}"/><feComposite in2="rimA" operator="in" result="rim"/>
  <feFlood flood-color="#ffffff"/><feComposite in2="whiteA" operator="in" result="white"/>
  <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="white"/></feMerge>
</filter>`

/* ================================================================
   The body — armour over a navy undersuit
   ================================================================ */
function legs() {
  const leg = (x) =>
    tube(`M ${x} 430 L ${x - 1} 462`, 28, C.navy) +
    shape(`M ${x - 16} 438 Q ${x} 432 ${x + 16} 438 L ${x + 14} 462 Q ${x} 467 ${x - 14} 462 Z`, 'url(#red)') +
    stroke(`M ${x - 12} 443 Q ${x} 439 ${x + 12} 443`, 'rgba(255,255,255,0.55)', 3)
  const foot = (x) =>
    ellipse(x, 476, 26, 12, C.foot) + stroke(`M ${x - 14} 470 Q ${x} 466 ${x + 12} 470`, 'rgba(255,255,255,0.3)', 3)
  return leg(231) + leg(281) + foot(227) + foot(285)
}

function lacing(x, y, h = 8) {
  return stroke(`M ${x - 4} ${y - h} L ${x - 4} ${y + h}`, C.goldBright, 4) + stroke(`M ${x + 4} ${y - h} L ${x + 4} ${y + h}`, C.goldBright, 4)
}

function skirt() {
  return (
    shape('M 192 394 L 320 394 L 342 446 Q 256 460 170 446 Z', 'url(#red)') +
    stroke('M 236 398 L 230 454', INK, 5) +
    stroke('M 276 398 L 282 454', INK, 5) +
    stroke('M 182 420 Q 256 430 330 420', INK, 4) +
    stroke('M 176 441 Q 256 454 336 441', C.gold, 6) +
    [213, 256, 299].map((x) => lacing(x, 409, 6)).join('')
  )
}

function chest() {
  return (
    shape('M 198 318 Q 256 304 314 318 L 324 400 Q 256 411 188 400 Z', 'url(#red)') +
    stroke('M 194 348 Q 256 358 318 348', INK, 4) +
    stroke('M 192 374 Q 256 384 320 374', INK, 4) +
    [222, 290].flatMap((x) => [lacing(x, 361, 7), lacing(x, 387, 7)]).join('') +
    // chest crest: a gold disc with an iron ring, as on the portfolio samurai
    circle(256, 356, 14, 'url(#gold)') +
    `<circle cx="256" cy="356" r="7" fill="none" stroke="${INK}" stroke-width="4"/>` +
    // waist cord
    tube('M 190 398 Q 256 410 322 398', 7, C.gold) +
    stroke('M 208 330 Q 226 322 244 322', 'rgba(255,255,255,0.6)', 6)
  )
}

/** The shoulder guard on the viewer's left; mirrored for the right. */
function sode() {
  return (
    shape('M 214 312 L 164 322 L 152 386 L 200 388 Z', 'url(#red)') +
    stroke('M 207 334 L 161 342', INK, 4) +
    stroke('M 203 358 L 157 364', INK, 4) +
    stroke('M 199 382 L 156 380', C.gold, 6) +
    lacing(184, 350, 6) +
    stroke('M 170 330 L 206 322', 'rgba(255,255,255,0.55)', 4)
  )
}

/* ================================================================
   The head — face under a kabuto with gold crescent horns
   ================================================================ */
function shikoro() {
  // Neck guard: flared, laced lames showing either side of the face.
  return (
    shape('M 136 196 Q 116 262 124 306 Q 190 324 256 324 Q 322 324 388 306 Q 396 262 376 196 Z', 'url(#red)') +
    stroke('M 124 238 Q 256 262 388 238', INK, 4) +
    stroke('M 122 272 Q 256 296 390 272', INK, 4) +
    stroke('M 128 302 Q 256 320 384 302', C.gold, 6) +
    lacing(140, 255, 6) +
    lacing(372, 255, 6) +
    lacing(138, 288, 6) +
    lacing(374, 288, 6)
  )
}

function faceBase(tint) {
  let out = ellipse(256, 252, 90, 78, 'url(#skin)')
  if (tint === 'rage') out += `<ellipse cx="256" cy="252" rx="87" ry="75" fill="url(#rage)"/>`
  if (tint === 'pale') out += `<ellipse cx="256" cy="252" rx="87" ry="75" fill="url(#pale)"/>`
  if (tint === 'gloom') out += `<ellipse cx="256" cy="252" rx="87" ry="75" fill="url(#gloom)"/>`
  return out
}

function helmet() {
  const ribs = [172, 200, 228, 256, 284, 312, 340]
    .map((x) => stroke(`M 256 92 Q ${r2(x + (x - 256) * 0.2)} 128 ${x} 192`, '#c9b793', 3))
    .join('')
  const wing = group(
    'rotate(-18 124 200)',
    `<rect x="100" y="172" width="46" height="56" rx="11" fill="url(#red)" stroke="${INK}" stroke-width="${W}"/>` +
      `<rect x="107" y="179" width="32" height="42" rx="7" fill="none" stroke="${C.gold}" stroke-width="4"/>` +
      circle(123, 200, 8, 'url(#gold)', { 'stroke-width': 4 })
  )
  const crescent =
    'M 166 30 C 144 130 200 178 256 178 C 312 178 368 130 346 30 C 356 118 306 152 256 152 C 206 152 156 118 166 30 Z'
  return (
    mirrored(wing) +
    shape('M 150 198 C 146 118 196 84 256 84 C 316 84 366 118 362 198 Z', 'url(#cream)') +
    ribs +
    `<ellipse cx="206" cy="122" rx="28" ry="12" fill="#fff" opacity="0.85" transform="rotate(-28 206 122)"/>` +
    circle(256, 88, 9, 'url(#gold)', { 'stroke-width': 5 }) +
    shape(crescent, 'url(#goldSide)') +
    stroke('M 170 50 C 162 118 206 160 244 166', 'rgba(255,255,255,0.75)', 4) +
    shape('M 140 188 Q 256 160 372 188 L 394 212 Q 256 190 118 212 Z', 'url(#red)') +
    stroke('M 126 207 Q 256 186 386 207', C.gold, 5) +
    stroke('M 160 186 Q 220 172 260 171', 'rgba(255,255,255,0.6)', 4) +
    circle(256, 162, 18, 'url(#gold)') +
    circle(256, 162, 8, '#c0392b', { 'stroke-width': 4 }) +
    `<circle cx="251" cy="156" r="4" fill="#fff" opacity="0.9"/>`
  )
}

/* ================================================================
   Faces
   ================================================================ */
const EL = [214, 254]
const ER = [298, 254]

function eyeOpen([cx, cy], { rx = 16, ry = 21, look = 0, sparkle = false, pool = false } = {}) {
  const id = nextId('eye')
  const iris = `<g clip-path="url(#${id})">
    <ellipse cx="${cx}" cy="${cy + ry * 0.5 + look}" rx="${rx * 0.9}" ry="${ry * 0.72}" fill="#8a4a22"/>
    <ellipse cx="${cx}" cy="${cy + ry * 0.68 + look}" rx="${rx * 0.62}" ry="${ry * 0.38}" fill="#d07a34"/>
    ${pool ? `<path d="M ${cx - rx} ${cy + ry * 0.25} Q ${cx} ${cy + ry * 1.25} ${cx + rx} ${cy + ry * 0.25} Q ${cx} ${cy + ry * 0.8} ${cx - rx} ${cy + ry * 0.25} Z" fill="${C.tear}" opacity="0.9"/>` : ''}
  </g>`
  const shine = sparkle
    ? sparkleShape(cx - rx * 0.28, cy - ry * 0.3 + look, rx * 0.62, '#ffffff', 0)
    : `<ellipse cx="${cx - rx * 0.3}" cy="${cy - ry * 0.34 + look}" rx="${rx * 0.4}" ry="${ry * 0.32}" fill="#fff"/>`
  return (
    `<clipPath id="${id}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>` +
    ellipse(cx, cy, rx, ry, INK, { 'stroke-width': 5 }) +
    iris +
    shine +
    `<circle cx="${cx + rx * 0.36}" cy="${cy + ry * 0.36 + look}" r="${rx * 0.17}" fill="#fff"/>` +
    (pool ? `<circle cx="${cx + rx * 0.05}" cy="${cy - ry * 0.02 + look}" r="${rx * 0.12}" fill="#fff"/>` : '')
  )
}

/** Mouth: an outlined shape whose inside (teeth, tongue) is clipped to it. */
function mouth(d, { teeth = '', tongue = '' } = {}) {
  const id = nextId('mouth')
  return (
    `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
    `<path d="${d}" fill="url(#mouth)"/>` +
    `<g clip-path="url(#${id})">${teeth}${tongue}</g>` +
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`
  )
}

const blush = (opacity = 0.55) =>
  `<ellipse cx="200" cy="286" rx="17" ry="9" fill="${C.blush}" opacity="${opacity}"/>` +
  `<ellipse cx="312" cy="286" rx="17" ry="9" fill="${C.blush}" opacity="${opacity}"/>`

const brows = (dLeft) => stroke(dLeft, INK, 9) + group('matrix(-1 0 0 1 512 0)', stroke(dLeft, INK, 9))

const FACES = {
  // Sparkling eye, a wink and a big grin.
  victory: () =>
    blush() +
    brows('M 198 226 Q 214 216 230 222') +
    eyeOpen(EL, { sparkle: true }) +
    stroke(`M ${ER[0] - 16} ${ER[1] + 3} Q ${ER[0]} ${ER[1] - 15} ${ER[0] + 16} ${ER[1] + 3}`, INK, 8) +
    mouth('M 218 286 Q 256 298 294 286 Q 292 330 256 332 Q 220 330 218 286 Z', {
      teeth: '<path d="M 214 280 Q 256 296 298 280 L 298 300 Q 256 310 214 300 Z" fill="#fff"/>',
      tongue: `<ellipse cx="256" cy="330" rx="22" ry="12" fill="${C.tongue}"/>`,
    }),

  // Glaring slits under a hard V of brows, teeth gritted, face flushed red.
  angry: () => {
    const slit = ([cx, cy], inner) =>
      shape(
        `M ${cx - 18 * inner} ${cy - 12} L ${cx + 18 * inner} ${cy + 1} Q ${cx + 18 * inner} ${cy + 20} ${cx} ${cy + 20} Q ${cx - 19 * inner} ${cy + 20} ${cx - 18 * inner} ${cy - 12} Z`,
        INK,
        { 'stroke-width': 5 }
      ) + `<circle cx="${cx - 2 * inner}" cy="${cy + 7}" r="4.5" fill="#fff"/>`
    return (
      stroke('M 236 212 L 238 226', '#a1161a', 4) +
      stroke('M 256 210 L 256 225', '#a1161a', 4) +
      stroke('M 276 212 L 274 226', '#a1161a', 4) +
      brows('M 192 222 L 234 238') +
      slit(EL, 1) +
      slit(ER, -1) +
      mouth('M 222 296 Q 256 288 290 296 L 294 320 Q 256 312 218 320 Z', {
        teeth: `<path d="M 200 280 L 312 280 L 312 340 L 200 340 Z" fill="#fff"/>
          <path d="M 219 308 Q 256 300 293 308" fill="none" stroke="${INK}" stroke-width="3"/>
          ${[238, 256, 274].map((x) => `<path d="M ${x} 288 L ${x} 322" stroke="${INK}" stroke-width="3"/>`).join('')}`,
      })
    )
  },

  // Big glossy eyes brimming over, brows knotted up, wobbling mouth, streams of tears.
  sad: () => {
    const stream = ([cx, cy], dir) =>
      shape(
        `M ${cx - 11} ${cy + 17} C ${cx - 13} ${cy + 40} ${cx - 16 + dir * 4} ${cy + 58} ${cx - 20 + dir * 6} ${cy + 80} Q ${cx - 4 + dir * 6} ${cy + 88} ${cx + 10 + dir * 6} ${cy + 80} C ${cx + 5} ${cy + 58} ${cx + 5} ${cy + 40} ${cx + 11} ${cy + 17} Z`,
        'url(#tear)',
        { 'stroke-width': 5 }
      ) + stroke(`M ${cx - 3} ${cy + 26} C ${cx - 5} ${cy + 44} ${cx - 6} ${cy + 58} ${cx - 8 + dir * 4} ${cy + 72}`, 'rgba(255,255,255,0.85)', 3)
    return (
      blush(0.65) +
      brows('M 196 234 Q 214 230 232 214') +
      eyeOpen(EL, { rx: 18, ry: 23, look: 3, pool: true }) +
      eyeOpen(ER, { rx: 18, ry: 23, look: 3, pool: true }) +
      stream(EL, -1) +
      stream(ER, 1) +
      mouth('M 228 306 Q 242 296 256 304 Q 270 296 284 306 Q 282 332 256 334 Q 230 332 228 306 Z', {
        tongue: `<ellipse cx="256" cy="334" rx="17" ry="10" fill="${C.tongue}"/>`,
      })
    )
  },

  // Eyes squeezed shut, huge open laugh, tears of joy.
  laugh: () =>
    blush(0.7) +
    brows('M 196 228 Q 214 216 232 224') +
    stroke(`M ${EL[0] - 15} ${EL[1] - 12} L ${EL[0] + 11} ${EL[1]} L ${EL[0] - 15} ${EL[1] + 12}`, INK, 8) +
    stroke(`M ${ER[0] + 15} ${ER[1] - 12} L ${ER[0] - 11} ${ER[1]} L ${ER[0] + 15} ${ER[1] + 12}`, INK, 8) +
    mouth('M 212 282 Q 256 296 300 282 Q 300 342 256 346 Q 212 342 212 282 Z', {
      teeth: '<path d="M 206 276 Q 256 296 306 276 L 306 296 Q 256 308 206 296 Z" fill="#fff"/>',
      tongue: `<ellipse cx="256" cy="346" rx="26" ry="16" fill="${C.tongue}"/>`,
    }),

  // Saucer eyes with pinprick pupils, brows flown up, mouth a tall O, colour draining.
  shock: () => {
    const eye = ([cx, cy]) =>
      circle(cx, cy, 20, '#ffffff', { 'stroke-width': 6 }) +
      `<circle cx="${cx}" cy="${cy + 1}" r="6" fill="${INK}"/><circle cx="${cx + 2}" cy="${cy - 1}" r="1.8" fill="#fff"/>`
    return (
      brows('M 196 222 Q 212 208 230 216') +
      eye(EL) +
      eye(ER) +
      mouth('M 256 290 C 272 290 274 330 256 330 C 238 330 240 290 256 290 Z', {
        tongue: `<ellipse cx="256" cy="330" rx="11" ry="8" fill="${C.tongue}"/>`,
      })
    )
  },
}

/* ================================================================
   Arms, hands and the katana
   ================================================================ */
const quadAt = (s, c, e, t) => [
  (1 - t) ** 2 * s[0] + 2 * (1 - t) * t * c[0] + t * t * e[0],
  (1 - t) ** 2 * s[1] + 2 * (1 - t) * t * c[1] + t * t * e[1],
]
/** The piece of a quadratic curve between t0 and t1, as a path. */
function quadPart(s, c, e, t0, t1) {
  const a = quadAt(s, c, e, t0)
  const b = quadAt(s, c, e, t1)
  // The sub-curve's control point is the curve's blossom at (t0, t1).
  const w0 = (1 - t0) * (1 - t1)
  const w1 = (1 - t0) * t1 + t0 * (1 - t1)
  const w2 = t0 * t1
  const q = [w0 * s[0] + w1 * c[0] + w2 * e[0], w0 * s[1] + w1 * c[1] + w2 * e[1]]
  return `M ${r2(a[0])} ${r2(a[1])} Q ${r2(q[0])} ${r2(q[1])} ${r2(b[0])} ${r2(b[1])}`
}

function hand([x, y], kind = 'fist', rot = 0) {
  if (kind === 'palm') {
    return group(
      `rotate(${rot} ${x} ${y})`,
      ellipse(x, y, 16, 20, 'url(#skin)') +
        stroke(`M ${x - 7} ${y - 12} L ${x - 7} ${y - 2}`, '#d98f6c', 3) +
        stroke(`M ${x + 1} ${y - 14} L ${x + 1} ${y - 3}`, '#d98f6c', 3) +
        stroke(`M ${x + 8} ${y - 11} L ${x + 8} ${y - 2}`, '#d98f6c', 3)
    )
  }
  return group(
    `rotate(${rot} ${x} ${y})`,
    circle(x, y, 17, 'url(#skin)') + stroke(`M ${x - 9} ${y - 5} Q ${x} ${y - 9} ${x + 9} ${y - 5}`, '#d98f6c', 3)
  )
}

/** A gold band around the forearm at curve parameter t. */
function cuff(s, c, h, t) {
  const p = quadAt(s, c, h, t)
  const q = quadAt(s, c, h, t + 0.02)
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
  const nx = (-(q[1] - p[1]) / len) * 17
  const ny = ((q[0] - p[0]) / len) * 17
  const d = `M ${r2(p[0] - nx)} ${r2(p[1] - ny)} L ${r2(p[0] + nx)} ${r2(p[1] + ny)}`
  return stroke(d, INK, 14, { 'stroke-linecap': 'butt' }) + stroke(d, C.gold, 7, { 'stroke-linecap': 'butt' })
}

/** Sleeve, lacquered forearm guard with a gold cuff, and the hand. */
function arm(s, c, h, { hand: kind = 'fist', handRot = 0 } = {}) {
  const d = `M ${s[0]} ${s[1]} Q ${c[0]} ${c[1]} ${h[0]} ${h[1]}`
  return (
    tube(d, 30, C.navy) +
    tube(quadPart(s, c, h, 0.45, 1), 32, C.red) +
    cuff(s, c, h, 0.8) +
    hand(h, kind, handRot)
  )
}

/**
 * A katana with its guard at (x, y), the blade pointing along `angle`
 * (0 = straight up, clockwise in degrees). The grip runs the other way.
 */
function katana(x, y, angle, len = 170) {
  const blade = `M -9 -6 L -9 ${-len + 32} Q -8 ${-len + 8} 3 ${-len} Q 12 ${-len + 16} 10 ${-len + 36} L 10 -6 Z`
  const hamon = Array.from({ length: Math.floor((len - 50) / 20) }, (_, i) => {
    const y0 = -14 - i * 20
    return `Q ${i % 2 ? 8.5 : 3.5} ${y0 - 10} 6 ${y0 - 20}`
  }).join(' ')
  const wrap = Array.from({ length: 5 }, (_, i) => {
    const y0 = 14 + i * 10.5
    return `<path d="M 0.5 ${y0} L 7 ${y0 + 5} L 0.5 ${y0 + 10} L -6 ${y0 + 5} Z" fill="#f1ece2"/>`
  }).join('')
  return group(
    `translate(${x} ${y}) rotate(${angle})`,
    shape(blade, 'url(#steel)') +
      `<path d="M 6 -14 ${hamon}" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.75"/>` +
      stroke(`M -2 -12 L -2 ${-len + 36}`, 'rgba(255,255,255,0.9)', 3.5) +
      shape('M -11 -15 L 12 -15 L 12 -4 L -11 -4 Z', 'url(#gold)', { 'stroke-width': 5 }) +
      shape('M -11 8 L 12 8 L 11 66 L -10 66 Z', C.wrap, { 'stroke-width': 5 }) +
      wrap +
      shape('M -12 64 L 13 64 Q 13 78 0.5 78 Q -12 78 -12 64 Z', 'url(#gold)', { 'stroke-width': 5 }) +
      ellipse(0.5, 2, 29, 9, '#3a3240', { 'stroke-width': 5 }) +
      `<ellipse cx="0.5" cy="1" rx="21" ry="5" fill="none" stroke="${C.gold}" stroke-width="3.5"/>`
  )
}

/** Where along the katana's grip a hand closes: 0 = at the guard, 1 = the pommel. */
function gripPoint(x, y, angle, t) {
  const a = (angle * Math.PI) / 180
  const d = 18 + t * 44
  return [r2(x - Math.sin(a) * d), r2(y + Math.cos(a) * d)]
}

/* ================================================================
   Effects
   ================================================================ */
function sparkleShape(x, y, r, fill, strokeWidth = 4) {
  const k = r * 0.2
  const d = `M ${x} ${y - r} Q ${x + k} ${y - k} ${x + r} ${y} Q ${x + k} ${y + k} ${x} ${y + r} Q ${x - k} ${y + k} ${x - r} ${y} Q ${x - k} ${y - k} ${x} ${y - r} Z`
  return strokeWidth ? shape(d, fill, { 'stroke-width': strokeWidth }) : `<path d="${d}" fill="${fill}"/>`
}

function angerVein(x, y, s = 1) {
  const quarter = 'M 5 -22 Q 5 -5 22 -5'
  const arms = [0, 90, 180, 270]
    .map((a) => group(`rotate(${a})`, stroke(quarter, INK, 17) + stroke(quarter, '#ff3b30', 9)))
    .join('')
  return group(`translate(${x} ${y}) scale(${s})`, arms)
}

function puff(x, y, s = 1) {
  const circles = [
    [0, 0, 13],
    [15, -6, 11],
    [-13, -4, 10],
    [5, -16, 9],
  ]
  const outline = circles.map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r}" fill="${INK}" stroke="${INK}" stroke-width="${W * 2}"/>`).join('')
  const fill = circles.map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r}" fill="#ffffff"/>`).join('')
  return group(`translate(${x} ${y}) scale(${s})`, outline + fill)
}

function drop(x, y, r, rot = 0) {
  const d = `M 0 ${-r * 1.7} C ${r * 0.55} ${-r * 0.7} ${r} ${-r * 0.1} ${r} ${r * 0.35} A ${r} ${r} 0 1 1 ${-r} ${r * 0.35} C ${-r} ${-r * 0.1} ${-r * 0.55} ${-r * 0.7} 0 ${-r * 1.7} Z`
  return group(
    `translate(${x} ${y}) rotate(${rot})`,
    shape(d, 'url(#tear)', { 'stroke-width': 5 }) +
      `<ellipse cx="${-r * 0.35}" cy="${r * 0.1}" rx="${r * 0.22}" ry="${r * 0.4}" fill="#fff" opacity="0.9"/>`
  )
}

const burst = (lines) => lines.map((d) => stroke(d, INK, 7)).join('')

/* ================================================================
   The five emotes
   ================================================================ */
const EMOTES = {
  // Blade raised high, fist on the hip, a wink and a grin. ✨
  victory() {
    const k = [380, 214]
    const kAngle = 12
    return {
      head: { rot: -5 },
      face: FACES.victory(),
      liftRight: -24,
      mid: arm([210, 332], [150, 372], [194, 398]),
      over: arm([312, 336], [392, 330], gripPoint(...k, kAngle, 0.3)),
      front: katana(...k, kAngle, 175) + hand(gripPoint(...k, kAngle, 0.3), 'fist', 12),
      fx:
        sparkleShape(446, 74, 24, '#fff27a') +
        sparkleShape(470, 150, 12, '#ffffff') +
        sparkleShape(92, 96, 20, '#fff27a') +
        sparkleShape(70, 176, 11, '#ffffff') +
        sparkleShape(96, 318, 14, '#fff27a') +
        sparkleShape(404, 118, 13, '#ffffff', 3),
    }
  },

  // Katana drawn in a two-handed guard, face flushed, a vein popping, steam. 💢
  angry() {
    const k = [320, 330]
    const kAngle = 42
    const g1 = gripPoint(...k, kAngle, 0.15)
    const g2 = gripPoint(...k, kAngle, 0.72)
    return {
      head: { dy: 4 },
      tint: 'rage',
      face: FACES.angry(),
      mid: arm([302, 332], [352, 372], g1) + arm([210, 332], [206, 396], g2),
      front: katana(...k, kAngle, 172) + hand(g1, 'fist', 42) + hand(g2, 'fist', 42),
      fx: angerVein(372, 118, 1.25) + angerVein(140, 150, 0.8) + puff(104, 252, 1) + puff(410, 250, 0.9),
    }
  },

  // Head hung, wiping at the tears with one fist, katana trailing on the ground. 😭
  sad() {
    const k = [346, 424]
    const kAngle = 112
    const grip = gripPoint(...k, kAngle, 0.25)
    return {
      head: { dy: 12, rot: 6 },
      tint: 'gloom',
      face: FACES.sad(),
      mid: arm([302, 334], [330, 380], grip) + arm([210, 334], [166, 366], [184, 318]),
      front: katana(...k, kAngle, 130) + hand(grip, 'fist', 112) + hand([184, 318], 'fist', -30),
      fx: drop(136, 250, 9, -40) + drop(118, 300, 7, -60) + drop(398, 262, 9, 40) + drop(420, 310, 7, 55),
    }
  },

  // Leaning back, both hands on his belly, katana stuck in the ground beside him. 😂
  laugh() {
    return {
      lean: -6,
      head: { rot: -4 },
      face: FACES.laugh(),
      back:
        katana(392, 330, 176, 150) +
        stroke('M 384 486 L 374 478', INK, 5) +
        stroke('M 404 490 L 404 478', INK, 5) +
        stroke('M 422 486 L 432 478', INK, 5),
      mid: arm([302, 334], [338, 386], [284, 384], { handRot: 20 }) + arm([210, 334], [176, 386], [230, 386], { handRot: -20 }),
      fx:
        drop(170, 226, 9, -70) +
        drop(146, 206, 7, -60) +
        drop(342, 226, 9, 70) +
        drop(366, 206, 7, 60),
    }
  },

  // Hands clapped to his cheeks, katana slipping from his grip, sweat flying. 😱
  surprised() {
    return {
      head: { dy: -4 },
      tint: 'pale',
      face: FACES.shock(),
      mid: arm([210, 334], [148, 346], [178, 290], { hand: 'palm', handRot: 18 }) + arm([302, 334], [364, 346], [334, 290], { hand: 'palm', handRot: -18 }),
      front:
        hand([178, 290], 'palm', 18) +
        hand([334, 290], 'palm', -18) +
        katana(410, 372, 152, 150) +
        stroke('M 440 300 Q 452 318 450 336', INK, 5) +
        stroke('M 456 290 Q 470 312 468 332', INK, 5),
      fx:
        drop(128, 204, 10, -25) +
        drop(390, 196, 10, 25) +
        drop(110, 250, 7, -35) +
        burst([
          'M 96 150 L 76 136',
          'M 88 186 L 64 182',
          'M 416 150 L 436 136',
          'M 424 186 L 448 182',
          'M 110 118 L 96 98',
          'M 402 118 L 416 98',
        ]),
    }
  },
}

/* ================================================================
   Assembly
   ================================================================ */
function compose({ head = {}, face = '', tint = null, back = '', mid = '', over = '', front = '', fx = '', lean = 0, liftRight = 0 }) {
  const headT = `translate(${head.dx || 0} ${head.dy || 0}) rotate(${head.rot || 0} 256 252)`
  const art = `<g id="art">
    <g transform="rotate(${lean} 256 476)">
      ${back}
      ${legs()}
      ${skirt()}
      ${chest()}
      ${mid}
      ${liftRight ? sode() : mirrored(sode())}
      ${group(headT, shikoro() + faceBase(tint) + face + helmet())}
      ${over}
      ${liftRight ? group(`rotate(${liftRight} 302 318)`, group('matrix(-1 0 0 1 512 0)', sode())) : ''}
      ${front}
    </g>
    ${fx}
  </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>${DEFS}${art}</defs>
<g filter="url(#sticker)"><use href="#art"/></g>
<use href="#art"/>
</svg>
`
}

fs.mkdirSync(OUT, { recursive: true })
for (const [name, build] of Object.entries(EMOTES)) {
  uid = 0
  const file = path.join(OUT, `samurai-${name}.svg`)
  fs.writeFileSync(file, compose(build()))
  console.log('wrote', path.relative(process.cwd(), file))
}
