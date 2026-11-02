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
