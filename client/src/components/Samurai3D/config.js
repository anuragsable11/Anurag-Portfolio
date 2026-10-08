/**
 * Site-wide settings for the samurai.
 *
 *   renderer  'auto': WebGPU on discrete GPUs, WebGL 2 elsewhere (integrated
 *                     GPUs draw this scene faster with WebGL 2; see
 *                     renderer.js for the measurements).
 *             'webgpu': WebGPU wherever the browser has it.
 *             'webgl': always WebGL 2.
 *             Every choice falls back to WebGL 2, and then to the poster.
 *             (For testing, ?samurai-renderer=webgl / webgpu / auto in the
 *             page URL overrides this.)
 *   model     null: the built-in samurai, modelled in code (SamuraiModel).
 *             A URL: a GLB to load instead (see SamuraiLoader.js for what
 *             it must contain), e.g. '/models/samurai.glb' for a file in
 *             client/public/models/.
 */
export const SAMURAI_CONFIG = {
  renderer: 'auto',
  model: null,
}

/**
 * The model to load: SAMURAI_CONFIG.model, or in development a
 * ?samurai-model=<url> override in the page URL (for trying a GLB without
 * editing this file).
 */
export function modelSource() {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('samurai-model')
    if (override) return override === 'procedural' ? null : override
  }
  return SAMURAI_CONFIG.model
}
