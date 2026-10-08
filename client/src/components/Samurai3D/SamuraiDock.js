/**
 * The corner dock: on wide desktop screens, once the hero scrolls away, the
 * samurai leaves his slot and waits in the corner of the viewport, so he
 * can keep reacting to the page.
 *
 * He must never cover the page's text or controls, and the content runs
 * the full width of the page, so whenever any of it is under his
 * silhouette he steps out of sight, and comes back once the corner has been
 * clear for a moment. This is watched without any scroll handler: every
 * text block, link, control and image is observed by an IntersectionObserver
 * whose root is the viewport shrunk (by a negative rootMargin) to exactly
 * his silhouette.
 *
 *   frameEl     the element that moves (gets .is-docked / .is-undocking /
 *               .is-dock-hidden)
 *   slotEl      the hero slot he leaves behind
 *   dismissEl   the × button that sends him away for the session
 *   onChange    called with { on, hidden } whenever either changes
 */
const DOCK_KEY = 'samurai-companion'

// What counts as content he may not cover.
const CONTENT = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'dt', 'dd', 'blockquote', 'pre', 'figcaption',
  'a', 'button', 'input', 'textarea', 'select', 'label', 'img', 'picture', 'video', 'canvas',
  'table', '[role="button"]', '[role="tab"]', '[tabindex]',
]
  .flatMap((tag) => [`main ${tag}`, `footer ${tag}`])
  .join(', ')

// His silhouette inside the docked box, which must match the CSS
// (.samurai-frame.is-docked: 136 × 180 px, 18 px from the right and 74 px
// from the bottom; .samurai-hit: inset 8% 22% 4%).
const BOX = { right: 18, bottom: 74, width: 136, height: 180 }
const INSET = { top: 0.08, side: 0.22, bottom: 0.04 }
// Seconds the corner must stay clear before he comes back.
const CLEAR_FOR = 0.45

export function createDock({ frameEl, slotEl, dismissEl, onChange }) {
  // Big enough to float him in the corner beside the content.
  const dockQuery = window.matchMedia('(min-width: 1280px) and (hover: hover) and (pointer: fine)')
  const dock = { on: false, hidden: false }
  let enabled = false
  let slotVisible = true
  let dismissed = false
  let undockTimer = 0
  try {
    dismissed = sessionStorage.getItem(DOCK_KEY) === 'hidden'
  } catch {
    // Storage blocked: he simply docks as usual.
  }

  /* ---- Content under his silhouette ---- */
  const under = new Set()
  let watcher = null
  let showTimer = 0
  let contentWatcher = null

  const setHidden = (hidden) => {
    if (hidden === dock.hidden) return
    dock.hidden = hidden
    frameEl?.classList.toggle('is-dock-hidden', hidden)
    onChange({ ...dock })
  }
  const judge = () => {
    clearTimeout(showTimer)
    if (!dock.on) return setHidden(false)
    // Out of the way at once; back only once the corner stays clear.
    if (under.size) setHidden(true)
    else if (dock.hidden) showTimer = setTimeout(() => setHidden(under.size > 0), CLEAR_FOR * 1000)
  }
  const observeAll = (root = document) => {
    root.querySelectorAll?.(CONTENT).forEach((el) => {
      if (!frameEl?.contains(el)) watcher.observe(el)
    })
  }
  const watch = () => {
    unwatch()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const right = BOX.right + BOX.width * INSET.side
    const bottom = BOX.bottom + BOX.height * INSET.bottom
    const left = vw - BOX.right - BOX.width + BOX.width * INSET.side
    const top = vh - BOX.bottom - BOX.height + BOX.height * INSET.top
    watcher = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRect.width * e.intersectionRect.height > 0) under.add(e.target)
          else under.delete(e.target)
        }
        judge()
      },
      { rootMargin: `${-top}px ${-right}px ${-bottom}px ${-left}px`, threshold: 0 }
    )
    observeAll()
    // Content that appears later (expanded cards, filtered lists) is watched too.
    contentWatcher = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.(CONTENT) ? watcher.observe(n) : observeAll(n)))
    })
    document.querySelectorAll('main, footer').forEach((el) => contentWatcher.observe(el, { childList: true, subtree: true }))
  }
  const unwatch = () => {
    watcher?.disconnect()
    contentWatcher?.disconnect()
    watcher = contentWatcher = null
    under.clear()
  }

  const update = () => {
    const want = enabled && !slotVisible && !dismissed && dockQuery.matches
    if (want === dock.on || !frameEl) return
    dock.on = want
    frameEl.classList.toggle('is-docked', want)
    frameEl.classList.toggle('is-undocking', !want)
    clearTimeout(undockTimer)
    if (!want) undockTimer = setTimeout(() => frameEl.classList.remove('is-undocking'), 600)
    if (want) watch()
    else {
      unwatch()
      dock.hidden = false
      frameEl.classList.remove('is-dock-hidden')
    }
    onChange({ ...dock })
  }

  const onDismiss = () => {
    dismissed = true
    try {
      sessionStorage.setItem(DOCK_KEY, 'hidden')
    } catch {
      // Not remembered, but hidden for now.
    }
    update()
  }
  dismissEl?.addEventListener('click', onDismiss)

  // The fixed nav covers the top of the viewport, so the slot counts as
  // gone once it is only behind the nav.
  const slotWatcher = new IntersectionObserver(
    (entries) => {
      slotVisible = entries.some((e) => e.isIntersecting)
      update()
    },
    { rootMargin: '-64px 0px 0px 0px' }
  )
  if (slotEl) slotWatcher.observe(slotEl)
  dockQuery.addEventListener('change', update)
  // The silhouette's place depends on the viewport's size.
  const onResize = () => dock.on && watch()
  window.addEventListener('resize', onResize)

  return {
    get on() {
      return dock.on
    },
    /** Docked but stepped out of sight (content under him). */
    get hidden() {
      return dock.hidden
    },
    /** Docking waits until the samurai is on screen. */
    enable() {
      enabled = true
      update()
    },
    dispose() {
      clearTimeout(undockTimer)
      clearTimeout(showTimer)
      unwatch()
      slotWatcher.disconnect()
      dockQuery.removeEventListener('change', update)
      window.removeEventListener('resize', onResize)
      dismissEl?.removeEventListener('click', onDismiss)
      frameEl?.classList.remove('is-docked', 'is-undocking', 'is-dock-hidden')
    },
  }
}
