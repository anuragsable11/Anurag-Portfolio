import * as THREE from 'three'

export const lerp = THREE.MathUtils.lerp
export const clamp = THREE.MathUtils.clamp
export const smoothstep = THREE.MathUtils.smoothstep
export const smootherstep = (k) => k * k * k * (k * (k * 6 - 15) + 10)

/** Frame-rate independent exponential approach of `x` toward `goal`. */
export const dampTo = (x, goal, rate, dt) => goal + (x - goal) * Math.exp(-rate * dt)

/** dampTo for angles: always turns the short way round. */
export const dampAngle = (x, goal, rate, dt) => {
  let d = goal - x
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return x + d * (1 - Math.exp(-rate * dt))
}

/**
 * A keyframe curve through (times[i], value(i)), i < n, evaluated at u: a
 * monotone cubic (Fritsch–Carlson), so motion flows through intermediate
 * keys without stopping at each one, never overshoots a key, and holds
 * still between keys of equal value. It eases in at the first key and out
 * at the last.
 */
const sv = new Float64Array(16)
const sd = new Float64Array(16)
const sm = new Float64Array(16)
export function keyframeCurve(n, times, value, u) {
  if (n === 1 || u <= times[0]) return value(0)
  if (u >= times[n - 1]) return value(n - 1)
  for (let i = 0; i < n; i++) sv[i] = value(i)
  for (let i = 0; i < n - 1; i++) sd[i] = (sv[i + 1] - sv[i]) / Math.max(1e-6, times[i + 1] - times[i])
  sm[0] = 0
  sm[n - 1] = 0
  for (let i = 1; i < n - 1; i++) sm[i] = sd[i - 1] * sd[i] > 0 ? (sd[i - 1] + sd[i]) / 2 : 0
  for (let i = 0; i < n - 1; i++) {
    if (sd[i] === 0) {
      sm[i] = 0
      sm[i + 1] = 0
      continue
    }
    const a = sm[i] / sd[i]
    const b = sm[i + 1] / sd[i]
    if (a < 0) sm[i] = 0
    if (b < 0) sm[i + 1] = 0
    const r = a * a + b * b
    if (r > 9) {
      const s = 3 / Math.sqrt(r)
      sm[i] *= s
      sm[i + 1] *= s
    }
  }
  let i = 0
  while (i < n - 2 && u >= times[i + 1]) i++
  const h = times[i + 1] - times[i]
  const t = (u - times[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * sv[i] +
    (t3 - 2 * t2 + t) * h * sm[i] +
    (-2 * t3 + 3 * t2) * sv[i + 1] +
    (t3 - t2) * h * sm[i + 1]
  )
}

/** Lets the browser paint a frame between slices of a long job. */
export const yieldToBrowser = () =>
  typeof scheduler !== 'undefined' && scheduler.yield
    ? scheduler.yield()
    : new Promise((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(null)
      })

/** Thrown out of a sliced job once its owner has been disposed. */
export const ABORT = Symbol('samurai unmounted')

/**
 * Long jobs run in slices: after `sliceMs` of work, control returns to the
 * browser so it can paint a frame — and the job stops for good (by throwing
 * ABORT) once `isAborted()` turns true. Await the returned function between
 * units of work.
 */
export function createSlicer(isAborted, sliceMs = 12) {
  let sliceStart = performance.now()
  return async () => {
    if (isAborted()) throw ABORT
    if (performance.now() - sliceStart < sliceMs) return
    await yieldToBrowser()
    if (isAborted()) throw ABORT
    sliceStart = performance.now()
  }
}
