import * as THREE from 'three'
import { renderStudioPMREM } from '../../lib/studio-env.js'
import { createWebGLTimer } from './gpu-timer.js'
import { createWebGLPost } from './post-webgl.js'
import { isIntegratedGpu, isSoftwareGpu } from './quality.js'

/**
 * Picks how the samurai is drawn:
 *
 *   WebGPU   three.js's WebGPURenderer, with the same scene and materials
 *            and its post chain built from TSL nodes (backend-webgpu.js,
 *            fetched only on this path).
 *   WebGL 2  the classic WebGLRenderer — and wherever WebGPU fails to start.
 *   null     no GPU drawing at all — the poster stands in (SamuraiFallback).
 *
 * `mode` decides when WebGPU is tried:
 *   'webgpu'  whenever the browser has it (a real adapter, not a software one)
 *   'auto'    only on a discrete GPU. Measured on an integrated one (Intel
 *             UHD 630, three.js r186), the WebGPU path compiled its shaders
 *             five times slower (2.5 s against 0.5 s) and drew each frame
 *             about 70% slower than WebGL 2, for the same picture — so
 *             integrated GPUs (most laptops and phones) keep WebGL 2, and
 *             only GPUs with headroom to spare take WebGPU.
 *   'webgl'   never
 *
 * Resolves with the renderer and what differs between the two:
 *   { renderer, backend: 'webgpu' | 'webgl2', gpuName, maxAnisotropy,
 *     timer, createPost(options), prepareMaterials(materials, rim),
 *     studioEnvironment() }
 */
export async function createRenderer({ mode = 'auto' } = {}) {
  if (mode === 'webgpu') return (await tryWebGPU(() => true)) || createWebGLBackend()
  const webgl = createWebGLBackend()
  // 'auto': WebGL 2 names the GPU first, so integrated and software GPUs
  // never even ask for a WebGPU adapter; a discrete one tries WebGPU and,
  // if it starts, the WebGL renderer is let go.
  if (mode === 'auto' && webgl && !isIntegratedGpu(webgl.gpuName) && !isSoftwareGpu(webgl.gpuName)) {
    const webgpu = await tryWebGPU(isDiscrete)
    if (webgpu) {
      webgl.renderer.dispose()
      return webgpu
    }
  }
  return webgl
}

/** A WebGPU backend, if the browser has an adapter that `accept`s; else null. */
async function tryWebGPU(accept) {
  if (typeof navigator === 'undefined' || !navigator.gpu) return null
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter || adapter.info?.isFallbackAdapter || !accept(adapter.info || {})) return null
    const { createWebGPUBackend } = await import('./backend-webgpu.js')
    return await createWebGPUBackend(adapter)
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Samurai: WebGPU unavailable, using WebGL 2.', e)
    return null
  }
}

/**
 * A discrete GPU, by its adapter's description: NVIDIA, or AMD other than
 * the integrated Radeon "Graphics" / Vega parts in its APUs. Intel, Apple,
 * Arm, Qualcomm and anything unreported count as integrated.
 */
function isDiscrete(info = {}) {
  const vendor = String(info.vendor || '').toLowerCase()
  const text = `${info.architecture || ''} ${info.device || ''} ${info.description || ''}`
  if (vendor === 'nvidia') return true
  if (vendor === 'amd') return !/Radeon\(TM\) Graphics|Radeon Graphics|Vega \d|Vega Graphics/i.test(text)
  return false
}

function createWebGLBackend() {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
  } catch {
    return null
  }
  const gl = renderer.getContext()
  // Integrated GPUs (and software renderers) start lower on the quality
  // ladder and with lighter shadows; the governor measures the real frame
  // cost and climbs or descends from there.
  let gpuName = ''
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    // Not exposed: assume a discrete GPU and let the governor decide.
  }
  return {
    renderer,
    backend: 'webgl2',
    gpuName,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    timer: createWebGLTimer(gl),
    createPost: createWebGLPost,
    // WebGL materials take their rim through onBeforeCompile (SamuraiModel).
    prepareMaterials() {},
    studioEnvironment: () => renderStudioPMREM(renderer),
    /**
     * Call before disposing the renderer. three.js (r186) shares one DFG
     * lookup texture between every WebGLRenderer, and each renderer that
     * uploads it hangs a dispose listener on it that holds its GL context —
     * so a disposed renderer, its canvas and everything drawn with it would
     * stay in memory for good. Disposing the shared texture lets go of
     * every such hold; any other renderer on the page simply uploads it
     * again the next time it draws a physical material.
     */
    releaseShared(materials) {
      for (const material of materials) {
        const lut = renderer.properties.get(material)?.uniforms?.dfgLUT?.value
        if (lut?.isTexture) {
          lut.dispose()
          return
        }
      }
    },
  }
}
