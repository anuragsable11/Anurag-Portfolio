/**
 * Starts the samurai's slow, three.js-free work as early as possible: the
 * surface maps (generated in a worker) and the baked reflection map (a PNG
 * decoded to pixels). Neither needs three.js, so the Hero can kick both off
 * while the 3D chunk is still downloading, and the samurai then finds them
 * finished, or nearly so, when he mounts. Every call returns the same
 * promises, so calling it twice costs nothing.
 */
import envUrl from '../assets/samurai-env.png'
import { modelSource } from '../components/Samurai3D/config.js'

// Phones get half-resolution maps: a quarter of the memory and the work.
export const TEXTURE_QUALITY =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720)
    ? 'low'
    : 'high'

/** Asks a worker for the surface maps; falls back to generating them here. */
export function requestTextures(quality) {
  const inline = () => import('./samurai-textures.js').then((m) => m.generateTextures(quality))
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(new URL('./samurai-textures.worker.js', import.meta.url), {
        type: 'module',
      })
    } catch {
      resolve(inline())
      return
    }
    worker.onmessage = (e) => {
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = () => {
      worker.terminate()
      resolve(inline())
    }
    worker.postMessage({ quality })
  })
}

/**
 * Fetches the baked environment PNG and returns its raw pixels. The layout
 * (RGB above, the RGBM multiplier below) is decoded into a texture by
 * studio-env.js, which needs three.js; this half does not.
 */
export async function fetchBakedEnvironment(url = envUrl) {
  const blob = await (await fetch(url)).blob()
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  // Read the size first: a closed bitmap reports zero for both.
  const width = bitmap.width
  const height = bitmap.height / 2
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  return { px, width, height }
}

/** A GLB's bytes, or null if it cannot be fetched (the loader then reports it). */
async function fetchModel(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.arrayBuffer()
}

let assets = null

/**
 * The samurai's assets, started on first call and shared by every caller:
 * the reflection map always; the surface maps for the built-in model, or
 * the GLB's bytes when one is configured (see Samurai3D/config.js).
 */
export function preloadSamurai() {
  if (!assets) {
    const glb = modelSource()
    assets = {
      textures: glb ? Promise.resolve(null) : requestTextures(TEXTURE_QUALITY).catch(() => null),
      env: fetchBakedEnvironment().catch(() => null),
      model: glb ? fetchModel(glb).catch(() => null) : Promise.resolve(null),
    }
  }
  return assets
}
