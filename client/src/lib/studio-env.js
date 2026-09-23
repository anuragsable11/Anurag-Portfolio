import * as THREE from 'three'

/**
 * The reflection environment for the samurai.
 *
 * Physical materials need a pre-filtered (PMREM) environment map, but
 * generating one at runtime compiles a 256-sample GGX convolution shader —
 * close to a second of frozen main thread on D3D-backed browsers. So the map
 * is generated once, offline, by `tools/bake-samurai-env.html`, and shipped as
 * a small PNG that decodes straight into the finished CubeUV texture.
 *
 * PNG layout: the upper half holds RGB, the lower half holds the RGBM
 * multiplier as grey. Both are fully opaque, because browsers premultiply
 * alpha and would destroy the colour of dim pixels if M lived in alpha.
 */

export const ENV_CUBE_SIZE = 128
export const ENV_SIGMA = 0.04
// Brightest linear value the encoding can hold; the softbox peaks around 7.
export const ENV_RGBM_RANGE = 8

/**
 * A softbox studio: a dim room with a warm key panel, two cool rim strips
 * and an overhead light, built only from unlit materials.
 */
export function studioEnvironment() {
  const scene = new THREE.Scene()
  const box = new THREE.BoxGeometry(1, 1, 1)
  const materials = []
  const add = (color, intensity, scale, position, side = THREE.FrontSide) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side,
    })
    materials.push(material)
    const m = new THREE.Mesh(box, material)
    m.scale.set(...scale)
    m.position.set(...position)
    if (side === THREE.FrontSide) m.lookAt(0, 1.5, 0)
    scene.add(m)
  }

  add(0x30343b, 1, [16, 12, 16], [0, 4, 0], THREE.BackSide)
  add(0x0d0e10, 1, [15.8, 0.1, 15.8], [0, -1.9, 0])
  add(0xfff1e0, 7, [4.5, 3.2, 0.1], [4.5, 6, 6])
  add(0xb8d0ff, 5, [2, 6, 0.1], [-7, 3, -4])
  add(0xc8dcff, 3.5, [2, 6, 0.1], [7, 3, -5])
  add(0xffffff, 2.2, [7, 0.1, 3], [0, 9.8, 1])
  add(0xdfe7f5, 1.2, [3, 3, 0.1], [-6, 2, 5])

  return {
    scene,
    dispose() {
      box.dispose()
      materials.forEach((m) => m.dispose())
    },
  }
}

/** Renders the studio into a CubeUV render target — the slow, runtime path. */
export function renderStudioPMREM(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const studio = studioEnvironment()
  const target = pmrem.fromScene(studio.scene, ENV_SIGMA, 0.1, 100, { size: ENV_CUBE_SIZE })
  studio.dispose()
  pmrem.dispose()
  return target
}

/** Encodes a PMREM render target as the opaque RGBM PNG described above. */
export function encodePMREM(renderer, target) {
  const { width, height } = target
  const halfs = new Uint16Array(width * height * 4)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, halfs)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(width, height * 2)
  const lower = width * height * 4
  for (let i = 0; i < width * height; i++) {
    const r = THREE.DataUtils.fromHalfFloat(halfs[i * 4])
    const g = THREE.DataUtils.fromHalfFloat(halfs[i * 4 + 1])
    const b = THREE.DataUtils.fromHalfFloat(halfs[i * 4 + 2])
    const peak = Math.max(r, g, b, 1e-6) / ENV_RGBM_RANGE
    const m = Math.min(Math.ceil(peak * 255), 255) / 255
    const scale = 1 / (m * ENV_RGBM_RANGE)
    img.data[i * 4] = Math.round(Math.min(r * scale, 1) * 255)
    img.data[i * 4 + 1] = Math.round(Math.min(g * scale, 1) * 255)
    img.data[i * 4 + 2] = Math.round(Math.min(b * scale, 1) * 255)
    img.data[i * 4 + 3] = 255
    img.data[lower + i * 4] = img.data[lower + i * 4 + 1] = img.data[lower + i * 4 + 2] =
      Math.round(m * 255)
    img.data[lower + i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Fetches the baked PNG and decodes it into a ready-to-use CubeUV texture,
 * which three.js uses directly without running PMREM.
 */
export async function loadBakedEnvironment(url) {
  const blob = await (await fetch(url)).blob()
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  const width = bitmap.width
  const height = bitmap.height / 2
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data

  const lower = width * height * 4
  const data = new Uint16Array(width * height * 4)
  const one = THREE.DataUtils.toHalfFloat(1)
  for (let i = 0; i < width * height; i++) {
    const m = (px[lower + i * 4] / 255) * ENV_RGBM_RANGE
    data[i * 4] = THREE.DataUtils.toHalfFloat((px[i * 4] / 255) * m)
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat((px[i * 4 + 1] / 255) * m)
    data[i * 4 + 2] = THREE.DataUtils.toHalfFloat((px[i * 4 + 2] / 255) * m)
    data[i * 4 + 3] = one
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
    THREE.CubeUVReflectionMapping
  )
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
