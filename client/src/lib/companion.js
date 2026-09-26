import { useSyncExternalStore } from 'react'

/**
 * The samurai's mind: a tiny store the rest of the site talks to.
 *
 * Nothing here knows about three.js. Sections, cards and forms report what
 * the visitor is doing; the samurai component subscribes and performs. That
 * keeps the character reusable, and leaves one place for an assistant to
 * plug into later: it would subscribe() for context (the section in view),
 * and call setMood / act / celebrate to react, exactly as the page does.
 *
 *   section  the portfolio section in view (from observeSections)
 *   base     the mood that section calls for
 *   mood     the mood in effect right now — `base`, or a short override
 *   action   a one-shot performance ({ id, name }); ids only ever grow
 */

export const MOODS = Object.freeze(['calm', 'thinking', 'focused', 'battle', 'victory'])

/** Which mood each section puts him in. Unlisted sections fall back to calm. */
export const SECTION_MOODS = Object.freeze({
  home: 'calm',
  about: 'thinking',
  skills: 'focused',
  projects: 'battle',
  journey: 'thinking',
  contact: 'calm',
})

/** How he reacts to the kind of skill the visitor is looking at. */
export const MOOD_FOR_SKILL = Object.freeze({
  backend: 'focused',
  data: 'focused',
  tools: 'focused',
  ai: 'thinking',
  web: 'calm',
})

const state = { section: 'home', base: 'calm', mood: 'calm', action: null }
let snapshot = { ...state }
const listeners = new Set()
let actionId = 0
let holdTimer = 0
let chainTimer = 0

function emit() {
  snapshot = { ...state }
  listeners.forEach((fn) => fn(snapshot))
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getState() {
  return snapshot
}

/**
 * Puts him in a mood. With `hold` (ms) it is temporary and he returns to the
 * section's mood afterwards; with 0 it sticks until clearMood / the next
 * section.
 */
export function setMood(mood, hold = 2500) {
  if (!MOODS.includes(mood)) return
  clearTimeout(holdTimer)
  holdTimer = 0
  if (state.mood !== mood) {
    state.mood = mood
    emit()
  }
  if (hold > 0) {
    holdTimer = setTimeout(() => {
      holdTimer = 0
      if (state.mood !== state.base) {
        state.mood = state.base
        emit()
      }
    }, hold)
  }
}

export function clearMood() {
  clearTimeout(holdTimer)
  holdTimer = 0
  if (state.mood !== state.base) {
    state.mood = state.base
    emit()
  }
}

/**
 * A one-shot performance: 'slash', 'draw', 'spin', 'leap', 'thrust',
 * 'salute', 'bow', 'hop' or 'nod'.
 */
export function act(name) {
  state.action = { id: ++actionId, name }
  emit()
}

/** The visitor did something worth celebrating: a quick cut, then the blade goes up. */
export function celebrate() {
  clearTimeout(chainTimer)
  act('slash')
  setMood('battle', 1000)
  chainTimer = setTimeout(() => setMood('victory', 2200), 1000)
}

export function setSection(id) {
  if (id === state.section) return
  const previous = state.section
  state.section = id
  state.base = SECTION_MOODS[id] || 'calm'
  // A temporary mood in progress finishes first, then falls back to the new base.
  if (!holdTimer) state.mood = state.base
  emit()
  // Arriving at the contact section earns a bow.
  if (id === 'contact' && previous !== 'contact') act('bow')
}

/**
 * Watches the given sections and reports whichever one fills most of the
 * viewport. Hysteresis keeps it from flickering at the boundaries: a new
 * section takes over once it covers 42% of the viewport, or once the current
 * one has dropped below 20%. Returns a disposer.
 */
export function observeSections(ids, { switchAt = 0.42, keepAt = 0.2 } = {}) {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return () => {}
  const cover = new Map()
  let pending = 0

  const settle = () => {
    pending = 0
    let best = null
    let bestCover = 0
    for (const [id, c] of cover) {
      if (c > bestCover) {
        best = id
        bestCover = c
      }
    }
    if (!best || best === state.section) return
    const current = cover.get(state.section) || 0
    if (bestCover >= switchAt || current < keepAt) setSection(best)
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const vh = window.innerHeight || 1
      for (const entry of entries) {
        cover.set(entry.target.id, entry.isIntersecting ? entry.intersectionRect.height / vh : 0)
      }
      if (!pending) pending = requestAnimationFrame(settle)
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
  )
  ids.forEach((id) => {
    const el = document.getElementById(id)
    if (el) observer.observe(el)
  })

  return () => {
    observer.disconnect()
    cancelAnimationFrame(pending)
  }
}

/* ---- Skills: what kind of technology the visitor is looking at ---- */

// First match wins, so the more specific groups come first.
const SKILL_PATTERNS = [
  ['ai', /\bllm|ollama|qwen|gpt|\brag\b|agent|prompt|embedding|semantic|retrieval|hugging|torch|tensor|transformer|chroma|vector|\bml\b/i],
  ['web', /html|css|javascript|typescript|react|vite|frontend|tailwind|bootstrap/i],
  ['data', /sql|postgres|mysql|sqlite|mongo|database/i],
  ['tools', /docker|\bgit\b|github|postman|vs ?code|linux/i],
  ['backend', /python|django|fastapi|flask|celery|redis|\brest\b|\bapi|websocket|node|express|async|backend/i],
]

/** 'backend' | 'data' | 'tools' | 'ai' | 'web', or null if it is none of those. */
export function skillGroupOf(name) {
  if (!name) return null
  for (const [group, pattern] of SKILL_PATTERNS) if (pattern.test(name)) return group
  return null
}

let lastSkill = { group: null, at: 0 }

/**
 * The visitor is paying attention to a kind of skill. He shifts mood for a
 * moment and nods when the kind changes. Repeats within a few seconds are
 * ignored, so sweeping across a row of chips does not make him twitch.
 */
export function reportSkill(group) {
  if (!group) return
  const now = Date.now()
  if (group === lastSkill.group && now - lastSkill.at < 3000) return
  const changed = group !== lastSkill.group
  lastSkill = { group, at: now }
  setMood(MOOD_FOR_SKILL[group] || 'focused', 2200)
  if (changed) act('nod')
}

/* ---- Wiring: one call from the app starts everything page-wide ---- */

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** The samurai's moves: a key for each, shown as keycaps under the hero. */
export const MOVES = Object.freeze([
  { key: 'K', action: 'draw', label: 'Draw', title: 'Draw-cut' },
  { key: 'S', action: 'spin', label: 'Spin', title: 'Whirlwind spin' },
  { key: 'J', action: 'leap', label: 'Leap', title: 'Leap with the blade raised' },
  { key: 'T', action: 'thrust', label: 'Thrust', title: 'Two-handed thrust' },
  { key: 'B', action: 'salute', label: 'Salute', title: 'Salute and bow' },
])
const MOVE_FOR_KEY = Object.fromEntries(MOVES.map((m) => [m.key.toLowerCase(), m.action]))

let lastMove = { name: null, at: -Infinity }
/**
 * Plays one of the moves. A move is not restarted while it is still
 * playing, and moves cannot be fired faster than a person could follow.
 */
export function playMove(name) {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now()
  if (now - lastMove.at < (name === lastMove.name ? 1500 : 400)) return false
  lastMove = { name, at: now }
  act(name)
  return true
}

const SKILL_TARGETS = '[data-skill-group], .project-stack .chip'

/**
 * Starts the page-wide listeners: which section is in view, hovering or
 * focusing a skill, and the move keys. Returns a disposer.
 */
export function startCompanion(sectionIds) {
  if (typeof window === 'undefined') return () => {}
  const stopSections = observeSections(sectionIds)

  // A key for each move. Typing in a field, shortcuts and key repeat are
  // left alone.
  const onKeyDown = (e) => {
    const name = MOVE_FOR_KEY[e.key?.toLowerCase()]
    if (!name) return
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
    if (e.target instanceof Element && e.target.closest(EDITABLE)) return
    playMove(name)
  }

  const skillOf = (el) => {
    const target = el instanceof Element ? el.closest(SKILL_TARGETS) : null
    return target && (target.dataset.skillGroup || skillGroupOf(target.textContent))
  }
  const onPointerOver = (e) => {
    if (e.pointerType === 'mouse') reportSkill(skillOf(e.target))
  }
  const onFocusIn = (e) => reportSkill(skillOf(e.target))

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('pointerover', onPointerOver, { passive: true })
  document.addEventListener('focusin', onFocusIn)

  return () => {
    stopSections()
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('pointerover', onPointerOver)
    document.removeEventListener('focusin', onFocusIn)
  }
}

/** React view of the store, for components that want to render his state. */
export function useCompanion() {
  return useSyncExternalStore(subscribe, getState, getState)
}
