import { getState, subscribe } from '../../lib/companion.js'

/**
 * Everything the visitor does to the samurai, and everything the page tells
 * him:
 *  - the cursor, page-wide: his gaze follows it;
 *  - hover and keyboard focus: he comes a little more alive, and after a
 *    moment the tooltip names him;
 *  - click, tap, Enter or Space: onPress (the engine plays his cinematic);
 *  - any activity at all: he stays standing (he meditates only when left
 *    alone), and rises if he was kneeling;
 *  - page scroll: its velocity tips his head and weight, and how far the
 *    hero has scrolled away lifts the camera a touch;
 *  - the reduced-motion preference, followed live;
 *  - the companion store's moods and one-shot actions (lib/companion.js).
 *
 *   mount       the canvas' container: it takes clicks, keys and focus
 *   cursor      { x, y, active, at }: kept current here, read by the gaze
 *   hitEl       the docked silhouette's hit area (or null)
 *   slotEl      the hero slot (for how far the hero has scrolled away)
 *   controller  the animation controller
 *   stage       for the orbit drag (which hides the tooltip)
 *   clock       { now }: the loop's clock
 *   setTip      shows / hides the tooltip in React
 *   isDisposed  true once the component has unmounted
 *   onPress     what a click, tap or Enter does
 *   onCalm      (calm) => void when the reduced-motion preference changes
 */
export function createInteraction({
  mount,
  cursor,
  hitEl,
  slotEl,
  controller,
  stage,
  clock,
  setTip,
  isDisposed,
  onPress,
  onCalm,
}) {
  /* ---- Activity: anything the visitor does keeps him on his feet ---- */
  let activityAt = -Infinity
  const active = () => {
    // A few times a second is plenty.
    const t = performance.now()
    if (t - activityAt < 400) return
    activityAt = t
    controller.noteActivity()
  }

  /* ---- Cursor: tracked page-wide, so he can look at it anywhere ---- */
  const onWindowPointer = (e) => {
    active()
    if (e.pointerType !== 'mouse') return
    cursor.x = e.clientX
    cursor.y = e.clientY
    cursor.active = true
    cursor.at = clock.now
  }
  const onCursorGone = () => {
    cursor.active = false
  }
  window.addEventListener('pointermove', onWindowPointer, { passive: true })
  window.addEventListener('pointerdown', active, { passive: true })
  window.addEventListener('keydown', active, { passive: true })
  window.addEventListener('wheel', active, { passive: true })
  document.documentElement.addEventListener('mouseleave', onCursorGone)
  window.addEventListener('blur', onCursorGone)

  /* ---- Scroll: a velocity for his pose, a progress for the camera ---- */
  const scroll = { y: window.scrollY, at: performance.now(), rise: 0 }
  let slotRect = null
  const measureRise = () => {
    // How far the hero slot has scrolled up out of view: 0 → 1.
    if (!slotEl) return
    slotRect = slotEl.getBoundingClientRect()
    scroll.rise = slotRect.height ? Math.min(1, Math.max(0, -slotRect.top / slotRect.height)) : 0
  }
  const onScroll = () => {
    active()
    const t = performance.now()
    const y = window.scrollY
    const dt = Math.max(8, t - scroll.at) / 1000
    // Roughly ±1 at a brisk 2000 px/s.
    controller.setScroll((y - scroll.y) / dt / 2000)
    scroll.y = y
    scroll.at = t
    measureRise()
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  measureRise()

  /* ---- Tooltip: on hover, focus or tap — never left up ---- */
  let tipTimer = 0
  let hoverTimer = 0
  const showTip = (ms) => {
    if (isDisposed()) return
    clearTimeout(tipTimer)
    setTip(true)
    if (ms) tipTimer = setTimeout(() => !isDisposed() && setTip(false), ms)
  }
  const hideTip = () => {
    clearTimeout(tipTimer)
    clearTimeout(hoverTimer)
    if (!isDisposed()) setTip(false)
  }

  // A tap or click — not a drag — is a press, and shows the tooltip.
  let press = null
  const onPointerDown = (e) => {
    press = { x: e.clientX, y: e.clientY, t: performance.now() }
  }
  const onPointerUp = (e) => {
    if (!press) return
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
    if (moved < 6 && performance.now() - press.t < 450) {
      onPress()
      showTip(2600)
    }
    press = null
  }
  const onPointerEnter = (e) => {
    if (e.pointerType !== 'mouse') return
    controller.setHover(true)
    clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => showTip(0), 350)
  }
  const onPointerLeave = (e) => {
    if (e.pointerType !== 'mouse') return
    controller.setHover(false)
    hideTip()
  }
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onPress()
  }
  const onFocus = () => {
    try {
      if (!mount.matches(':focus-visible')) return
    } catch {
      // Older engines without :focus-visible: show it on any focus.
    }
    controller.setHover(true)
    showTip(0)
  }
  const onBlur = () => {
    controller.setHover(false)
    hideTip()
  }
  const targets = [mount, hitEl].filter(Boolean)
  targets.forEach((el) => {
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointerenter', onPointerEnter)
    el.addEventListener('pointerleave', onPointerLeave)
  })
  mount.addEventListener('keydown', onKeyDown)
  mount.addEventListener('focus', onFocus)
  mount.addEventListener('blur', onBlur)
  stage.controls.addEventListener('start', hideTip)

  /* ---- Reduced motion, followed live ---- */
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const applyCalm = () => {
    controller.setCalm(motionQuery.matches)
    onCalm?.(motionQuery.matches)
  }
  applyCalm()
  motionQuery.addEventListener('change', applyCalm)

  /* ---- Companion store: moods and one-shot actions from the page ---- */
  let lastActionId = getState().action?.id ?? 0
  const unsubscribe = subscribe((s) => {
    controller.setMood(s.mood)
    if (s.action && s.action.id !== lastActionId) {
      lastActionId = s.action.id
      controller.playAction(s.action.name)
    }
  })
  controller.setMood(getState().mood)

  return {
    hideTip,
    /** How far the hero has scrolled away, 0..1 (for the camera). */
    get rise() {
      return scroll.rise
    },
    get calm() {
      return motionQuery.matches
    },
    dispose() {
      clearTimeout(tipTimer)
      clearTimeout(hoverTimer)
      unsubscribe()
      motionQuery.removeEventListener('change', applyCalm)
      window.removeEventListener('pointermove', onWindowPointer)
      window.removeEventListener('pointerdown', active)
      window.removeEventListener('keydown', active)
      window.removeEventListener('wheel', active)
      window.removeEventListener('scroll', onScroll)
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
      mount.removeEventListener('blur', onBlur)
      stage.controls.removeEventListener('start', hideTip)
    },
  }
}
