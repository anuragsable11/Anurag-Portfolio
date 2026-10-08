/**
 * Quality ladder
 *
 * The rungs a device can render on, top first. Each renders the scene at
 * `dpr` times the CSS size and, where it has ambient occlusion, the
 * occlusion at `ao` times that; rungs without AO skip the post-processing
 * chain and draw straight to the canvas. Desktops climb to nine samples per
 * screen pixel (on a 1× display) and drop as far as 1× with no AO; phones
 * only ever trade resolution.
 *
 * On a high-density display, AO rungs below the display's own ratio are
 * left out: occlusion is not worth a blurred picture, though a plain lower
 * ratio remains as the last resort.
 *
 * `cost` is a relative GPU cost (1 = 1× without AO), used to predict whether
 * the rung above still fits. It was fitted to timings on an integrated GPU:
 * a fixed cost per frame (draw calls, the shadow pass, the floor), the
 * scene's pixels, and — with AO — one more scene pass for normals plus the
 * occlusion's own pixels, which are dear.
 */
export function qualityLadder(finePointer, nativeDpr) {
  const rungs = finePointer
    ? [
        [3, 1],
        [2.5, 1],
        [2, 1],
        [2, 0.5],
        [1.5, 0.5],
        [2, 0],
        [1.25, 0.5],
        [1, 0.5],
        [1.5, 0],
        [1.25, 0],
        [1, 0],
      ].filter(([dpr, ao]) => ao === 0 || dpr >= nativeDpr - 0.01)
    : [nativeDpr, 1.5, 1.25, 1]
        .filter((d, i, all) => d <= nativeDpr && all.indexOf(d) === i)
        .map((d) => [d, 0])
  return rungs.map(([dpr, ao]) => ({
    dpr,
    ao,
    cost: 1 + 0.42 * (dpr * dpr - 1) + (ao > 0 ? 0.41 + 1.4 * (dpr * ao) ** 1.5 : 0),
  }))
}

// Where a desktop starts: a discrete GPU at 2× with full AO, an integrated
// one at 1.5× without. The governor measures and moves from there.
export const START_DISCRETE = { dpr: 2, ao: 1 }
export const START_INTEGRATED = { dpr: 1.5, ao: 0 }
export const rungOf = (ladder, want) =>
  Math.max(0, ladder.findIndex((q) => q.dpr === want.dpr && q.ao === want.ao))
// Never more rendered pixels than this per frame, whatever the rung says.
export const MAX_PIXELS = 3.6e6

/**
 * A software renderer (no GPU acceleration: blocklisted drivers, some VMs
 * and remote desktops). It draws the samurai at about one frame a second
 * and drags the whole page down with it, so he is shown as his poster.
 */
export function isSoftwareGpu(gpuName) {
  return /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render/i.test(gpuName)
}

/**
 * Integrated GPUs (and software renderers) start lower on the quality
 * ladder and with lighter shadows; the governor measures the real frame
 * cost and climbs or descends from there.
 */
export function isIntegratedGpu(gpuName) {
  return /Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Mesa|Radeon\(TM\) (Vega|Graphics)|Radeon Graphics/i.test(
    gpuName
  )
}
