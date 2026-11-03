/**
 * Whether the opening screen (the halftone portrait and the particle name
 * above the hero) has finished forming. Its intro runs on the main thread
 * and the GPU, so heavy work elsewhere on the page — the samurai's texture
 * worker, code and build — waits for it rather than making it stutter.
 */
let done = false
const waiting = new Set()

/** Called by the opening screen once its intro is over. */
export function markOpeningDone() {
  if (done) return
  done = true
  waiting.forEach((fn) => fn())
  waiting.clear()
}

/** Runs `fn` once the opening has formed (at once if it already has). */
export function whenOpeningDone(fn) {
  if (done) {
    fn()
    return () => {}
  }
  waiting.add(fn)
  return () => waiting.delete(fn)
}

/*
 * How far the opening card is zoomed: below 1 it shows the whole screen in
 * miniature, and 1 is the real screen. The navbar follows it frame by frame,
 * so it sits inside the card rather than over the page around it.
 */
let zoom = null // unknown until the card first reports
const zoomWatchers = new Set()

/** Called by the opening card on every frame of its zoom. */
export function setOpeningZoom(value) {
  if (value === zoom) return
  zoom = value
  zoomWatchers.forEach((fn) => fn(zoom))
}

/** Calls `fn` with the card's zoom now (once known) and on every change. */
export function watchOpeningZoom(fn) {
  zoomWatchers.add(fn)
  if (zoom !== null) fn(zoom)
  return () => zoomWatchers.delete(fn)
}
