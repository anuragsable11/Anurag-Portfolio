import { PMREMGenerator, RenderPipeline, WebGPURenderer } from 'three/webgpu'
import {
  builtinAOContext,
  dot,
  float,
  materialEmissive,
  mrt,
  normalView,
  pass,
  positionViewDirection,
  pow,
  renderOutput,
  screenUV,
  uniform,
} from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js'
import { ENV_CUBE_SIZE, ENV_SIGMA, studioEnvironment } from '../../lib/studio-env.js'

/**
 * The WebGPU half of renderer.js: only fetched where WebGPU is available.
 * The scene and its materials are the same as on WebGL; three.js turns
 * each material into its node equivalent when it first draws it. What
 * differs lives here: the rim term (a node instead of a shader patch), the
 * post chain (TSL nodes instead of EffectComposer passes) and the GPU timer
 * (timestamp queries instead of a timer extension).
 *
 * Resolves with null when WebGPU cannot start, so the caller falls back to
 * WebGL 2 (three.js's own fallback would be its WebGL backend for node
 * materials, which compiles slower than the classic WebGLRenderer).
 */
export async function createWebGPUBackend(adapter) {
  const renderer = new WebGPURenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    trackTimestamp: true,
  })
  try {
    await renderer.init()
  } catch {
    renderer.dispose()
    return null
  }
  if (!renderer.backend.isWebGPUBackend) {
    renderer.dispose()
    return null
  }
  const info = adapter.info || {}
  const gpuName = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ')
  return {
    renderer,
    backend: 'webgpu',
    gpuName,
    maxAnisotropy: renderer.getMaxAnisotropy(),
    timer: createTimer(renderer),
    createPost: createWebGPUPost,
    prepareMaterials,
    studioEnvironment() {
      const pmrem = new PMREMGenerator(renderer)
      const studio = studioEnvironment()
      const target = pmrem.fromScene(studio.scene, ENV_SIGMA, 0.1, 100, { size: ENV_CUBE_SIZE })
      studio.dispose()
      pmrem.dispose()
      return target
    },
  }
}

/**
 * The rim (see SamuraiModel's addRim): the same fresnel edge light, as a
 * node added to each lit material's emission. Its colour uniform holds the
 * model's shared Color object, so the effects layer drives both renderers
 * the same way.
 */
function prepareMaterials(materials, rim) {
  const color = uniform(rim.color.value)
  const power = uniform(rim.power.value)
  const edge = pow(float(1).sub(dot(normalView, positionViewDirection).saturate()), power)
  const term = color.mul(edge)
  for (const material of materials) {
    if (material.userData.rim) material.emissiveNode = materialEmissive.add(term)
  }
}

/**
 * GPU time per frame from timestamp queries, resolved asynchronously; the
 * governor reads the latest result. Null where the adapter has no
 * timestamp queries.
 */
function createTimer(renderer) {
  if (!renderer.backend.trackTimestamp) return null
  let latest = null
  let resolving = false
  return {
    begin() {},
    end() {
      if (resolving) return
      resolving = true
      renderer
        .resolveTimestampsAsync('render')
        .then((ms) => {
          if (typeof ms === 'number' && ms > 0) latest = ms
        })
        .catch(() => {})
        .finally(() => {
          resolving = false
        })
    },
    poll() {
      const ms = latest
      latest = null
      return ms
    },
    dispose() {},
  }
}

/**
 * Ambient occlusion and sharpening as a TSL render pipeline: a normal /
 * depth pre-pass feeds GTAO, the scene pass takes the occlusion as its
 * ambient context, then tone mapping and colour conversion, then the
 * sharpen on the display-ready image (as the WebGL chain does it).
 * Same options and result as post-webgl.js's createWebGLPost.
 */
async function createWebGPUPost({ renderer, scene, camera, transient, onReady, isDisposed }) {
  // Single-sampled: GTAO gathers from the depth buffer, which a
  // multisampled one cannot do (the pass would take the renderer's MSAA).
  const prePass = pass(scene, camera, { samples: 0 })
  prePass.setMRT(mrt({ output: normalView }))
  // The eye halos, trail and sparks are additive sprites: keep them out of
  // the normal / depth pass, or the occlusion treats them as solid plates.
  const preUpdate = prePass.updateBefore.bind(prePass)
  prePass.updateBefore = (frame) => {
    const hidden = transient().filter((o) => o.visible)
    hidden.forEach((o) => (o.visible = false))
    const result = preUpdate(frame)
    hidden.forEach((o) => (o.visible = true))
    return result
  }
  const occlusion = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera)
  occlusion.radius.value = 0.32
  occlusion.distanceExponent.value = 1
  occlusion.thickness.value = 1
  occlusion.scale.value = 3
  occlusion.samples.value = 20

  const scenePass = pass(scene, camera)
  scenePass.contextNode = builtinAOContext(occlusion.getTextureNode().sample(screenUV).r)
  // The sharpen renders the scene pass from inside its own draw, after
  // resetting the renderer to an opaque clear; the pass clears transparent
  // regardless, so the page still shows around him.
  const sceneUpdate = scenePass.updateBefore.bind(scenePass)
  scenePass.updateBefore = (frame) => {
    const { renderer: r } = frame
    const alpha = r.getClearAlpha()
    r.setClearAlpha(0)
    const result = sceneUpdate(frame)
    r.setClearAlpha(alpha)
    return result
  }
  const pipeline = new RenderPipeline(renderer)
  pipeline.outputColorTransform = false
  pipeline.outputNode = sharpen(renderOutput(scenePass), 0.6)

  let ready = false
  const chain = {
    get ready() {
      return ready
    },
    render() {
      pipeline.render()
    },
    resize(w, h, dpr, aoScale) {
      if (!(aoScale > 0)) return
      // The occlusion (and its pre-pass) can run below the frame's
      // resolution; the scene pass samples it back up.
      prePass.setResolutionScale(aoScale)
      occlusion.resolutionScale = aoScale
    },
    dispose() {
      pipeline.dispose()
      prePass.dispose?.()
      scenePass.dispose?.()
      occlusion.dispose?.()
    },
  }
  onReady(chain)
  try {
    await Promise.all([prePass.compileAsync(renderer), scenePass.compileAsync(renderer)])
  } catch {
    // Compiles on first use instead.
  }
  if (isDisposed()) return null
  ready = true
  return chain
}
