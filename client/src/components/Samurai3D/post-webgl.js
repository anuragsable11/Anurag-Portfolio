import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * WebGL post-processing for the samurai: ground-truth ambient occlusion in
 * the gaps between plates, then a contrast-adaptive sharpen. (The WebGPU
 * path builds the same chain from TSL nodes; see post-webgpu.js.)
 */

/**
 * Contrast-adaptive sharpening (after AMD's CAS), run on the final,
 * display-ready frame. It restores the crispness the browser's downscale of
 * a supersampled canvas takes off, and sharpens flat detail more than edges
 * that are already crisp. Where a neighbour is empty background the weight
 * falls to zero, so the silhouette never gains a halo.
 */
export const SharpenShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0));
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
      vec3 lo = min(c.rgb, min(min(n, s), min(e, w)));
      vec3 hi = max(c.rgb, max(max(n, s), max(e, w)));
      vec3 amp = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, vec3(1e-4)), 0.0, 1.0));
      vec3 wgt = -amp * mix(0.125, 0.2, amount);
      vec3 rgb = (c.rgb + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt);
      gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
    }`,
}

/**
 * Builds the AO chain and compiles every shader variant it needs before it
 * is used, so switching it on never stalls a frame.
 *
 *   renderer, scene, camera, mount
 *   transient   () => objects to hide from the AO normal pass (additive
 *               sprites such as the eye halos and the blade trail)
 *   onReady     called once the chain exists (before compiling), so the
 *               quality governor can size it for the current rung
 *   isDisposed  () => true once the component has unmounted
 *
 * Resolves with the chain, or null if it was abandoned.
 */
export async function createWebGLPost({ renderer, scene, camera, mount, transient, onReady, isDisposed }) {
  // 4× MSAA: with the frame already supersampled, more only costs bandwidth.
  const aoTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  })
  const composer = new EffectComposer(renderer, aoTarget)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.setSize(mount.clientWidth, mount.clientHeight)
  composer.addPass(new RenderPass(scene, camera))
  const gtao = new GTAOPass(scene, camera, mount.clientWidth, mount.clientHeight)
  gtao.updateGtaoMaterial({
    radius: 0.32,
    distanceExponent: 1,
    thickness: 1,
    scale: 3,
    samples: 20,
  })
  gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 })
  // The eye halos and the blade trail are additive sprites: keep them out
  // of the normal / depth pass, or the AO would treat them as solid plates.
  const gtaoRender = gtao.render.bind(gtao)
  gtao.render = (...args) => {
    const hidden = transient().filter((o) => o.visible)
    hidden.forEach((o) => (o.visible = false))
    gtaoRender(...args)
    hidden.forEach((o) => (o.visible = true))
  }
  composer.addPass(gtao)
  const output = new OutputPass()
  composer.addPass(output)
  const sharpen = new ShaderPass(SharpenShader)
  sharpen.material.toneMapped = false
  composer.addPass(sharpen)

  let ready = false
  const chain = {
    get ready() {
      return ready
    },
    render() {
      composer.render()
    },
    /** Sizes the chain for a rung; `ao` < 1 runs the occlusion below full resolution. */
    resize(w, h, dpr, ao) {
      if (!(ao > 0)) return
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
      // The occlusion (normals, AO and its denoise) can run below the
      // frame's resolution; the blend samples it back up bilinearly.
      if (ao < 1) gtao.setSize(Math.round(w * dpr * ao), Math.round(h * dpr * ao))
    },
    dispose() {
      gtao.dispose()
      output.dispose()
      sharpen.dispose()
      composer.dispose()
    },
  }
  onReady(chain)

  // Rendering into an off-screen target needs different variants of every
  // shader (no tone mapping, linear output), plus the pass shaders. Compile
  // them all in parallel before swapping the composer in, so turning AO on
  // never stalls a frame. Each warm-up has to match how the pass really
  // draws, or its cache key differs and the work is wasted:
  //  - the normal pass draws the real scene, so it takes the scene's lights;
  //  - the fullscreen passes draw one triangle through an orthographic
  //    camera, with no lights.
  // compile() runs synchronously for whichever target is bound, so the
  // target only needs binding around the calls.
  const tri = new THREE.BufferGeometry()
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3))
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2))
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const normals = new THREE.Mesh(tri, gtao.normalMaterial)
  const passes = new THREE.Scene()
  ;[gtao.gtaoMaterial, gtao.pdMaterial, gtao.copyMaterial, gtao.blendMaterial, sharpen.material].forEach((m) =>
    passes.add(new THREE.Mesh(tri, m))
  )
  renderer.setRenderTarget(aoTarget)
  const compiling = Promise.all([
    renderer.compileAsync(scene, camera),
    renderer.compileAsync(normals, camera, scene),
    renderer.compileAsync(passes, ortho),
  ])
  renderer.setRenderTarget(null)
  try {
    await compiling
  } catch {
    // Worst case the shaders compile on first use instead.
  }
  tri.dispose()
  if (isDisposed()) return null
  ready = true
  return chain
}
