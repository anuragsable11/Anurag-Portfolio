/**
 * Small capability checks, kept free of any heavy imports so callers can
 * decide whether to load the 3D / physics bundles at all.
 */

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** True when the browser can create a WebGL context. */
function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

/** True when the browser can run WebGL and the visitor wants motion. */
export function supports3D() {
  if (typeof window === 'undefined') return false
  if (prefersReducedMotion()) return false
  return hasWebGL()
}

/**
 * True when the browser can draw the 3D samurai (WebGPU or WebGL 2, with
 * WebGL as the floor). Unlike supports3D, reduced motion does not rule him
 * out: he honours it himself, with slower, gentler motion and no effects.
 */
export function canRenderSamurai() {
  if (typeof window === 'undefined') return false
  return hasWebGL()
}
