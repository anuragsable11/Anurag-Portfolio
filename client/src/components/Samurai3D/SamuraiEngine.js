import * as THREE from 'three'
import { createVisibilityGate, cssColor, cssNumber } from '../../lib/three-utils.js'
import { decodeBakedEnvironment } from '../../lib/studio-env.js'
import { TEXTURE_QUALITY, preloadSamurai, requestTextures } from '../../lib/samurai-preload.js'
import { createAnimationController } from './SamuraiAnimationController.js'
import { createDock } from './SamuraiDock.js'
import { createEffects } from './SamuraiEffects.js'
import { createInteraction } from './SamuraiInteraction.js'
import { loadModel } from './SamuraiLoader.js'
import { createMixerController } from './SamuraiMixerController.js'
import { createQuality } from './SamuraiQuality.js'
import { createStage } from './SamuraiScene.js'
import { SAMURAI_CONFIG, modelSource } from './config.js'
import { isIntegratedGpu, isSoftwareGpu } from './quality.js'
import { createRenderer } from './renderer.js'
import { ABORT, createSlicer } from './util.js'

/**
 * The samurai, as a self-contained engine on a DOM element: renderer,
 * stage, model, animation, effects, interaction and quality, plus the loop
 * that runs them only while he is on screen and the tab is shown.
 *
 *   mount       element the canvas fills (also takes clicks, keys, focus)
 *   frameEl     the element that docks to the corner
 *   slotEl      the hero slot it docks out of
 *   hitEl       the docked silhouette's hit area
 *   dismissEl   the dock's × button
 *   setTip      shows / hides the tooltip
 *   renderer    'auto' | 'webgpu' | 'webgl' (see renderer.js); defaults to
 *               SAMURAI_CONFIG.renderer
 *   still       tooling only: hold the clock at zero, for a posed still
 *               (open eyes, neutral breath) — see tools/render-samurai-poster
 *
 * Returns its API at once; the renderer starts asynchronously (WebGPU
 * needs a moment to find its adapter), and calls made before then are
 * ignored, apart from the quality level, which is remembered.
 *
 *   playAnimation(name, { duration })   a named state (STATES), a mood or
 *                                       an action ('cinematic', 'draw', …)
 *   transitionAnimation(state, seconds) crossfade to a named state and hold
 *   setInteractionState(state)          'idle' | 'hover' | 'active', or
 *                                       { hover: boolean }
 *   setQualityLevel(level)              'HIGH' | 'MEDIUM' | 'LOW' | 'AUTO'
 *   on(event, callback)                 returns an unsubscribe. Events:
 *       'ready'                         he is on screen
 *       'state'  (state)                the named state changed
 *       'cue'    ({ name, action })     an effects cue fired
 *       'quality' (tier)                the quality tier changed
 *       'unsupported' (reason)          no renderer could start, or only a
 *                                       software one ('software')
 *       'fallback' ('slow')             frames stayed too slow even at the
 *                                       lowest quality; drawing has stopped
 *       'error'  (error)                he could not be built
 *       'modelerror' (error)            the configured GLB failed to load
 *                                       (the built-in samurai stands in)
 *       'contextlost' / 'contextrestored'
 *   state, quality, ready               the named state; { tier, level, dpr,
 *                                       post, backend }; true once drawn
 *   snapshot(type, quality)             draws a frame now and returns it as a
 *                                       data URL (posters, tests)
 *   dispose()                           frees every GPU resource and listener
 */
export function createSamuraiEngine(options) {
  const listeners = new Map()
  const shell = {
    disposed: false,
    impl: null,
    level: null,
    emit: (name, data) => listeners.get(name)?.forEach((fn) => fn(data)),
  }
  const api = {
    playAnimation: (name, opts) => shell.impl?.controller.play(name, opts) ?? false,
    transitionAnimation: (state, duration) => shell.impl?.controller.transitionTo(state, duration) ?? false,
    setInteractionState: (state) => shell.impl?.setInteractionState(state),
    setQualityLevel(level) {
      shell.level = level
      return shell.impl ? shell.impl.quality.setLevel(level) : level
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(fn)
      return () => listeners.get(name)?.delete(fn)
    },
    get state() {
      return shell.impl?.controller.state ?? 'IDLE'
    },
    get quality() {
      return shell.impl?.qualityInfo() ?? null
    },
    get ready() {
      return !!shell.impl?.started()
    },
    snapshot: (type, encoderQuality) => shell.impl?.snapshot(type, encoderQuality) ?? null,
    dispose() {
      if (shell.disposed) return
      shell.disposed = true
      listeners.clear()
      shell.impl?.dispose()
    },
  }
  boot(options, shell).catch((e) => {
    console.error(e)
    shell.emit('error', e)
  })
  return api
}

async function boot(
  { mount, frameEl, slotEl, hitEl, dismissEl, setTip = () => {}, renderer: wanted, still = false },
  shell
) {
  const { emit } = shell
  const isDisposed = () => shell.disposed
  const choice = wanted || rendererOverride() || SAMURAI_CONFIG.renderer
  const made = await createRenderer({ mode: choice })
  if (shell.disposed) {
    made?.renderer.dispose()
    return
  }
  if (!made) {
    emit('unsupported')
    return
  }
  const { renderer, backend, gpuName, timer, createPost, prepareMaterials, studioEnvironment } = made
  // No GPU acceleration: he would draw at a frame a second and take the
  // page down with him. His poster stands in.
  if (isSoftwareGpu(gpuName)) {
    renderer.dispose()
    emit('unsupported', 'software')
    return
  }

  const finePointer = window.matchMedia('(pointer: fine)').matches
  const integrated = isIntegratedGpu(gpuName)

  // The model: the built-in samurai, or a configured GLB — and the built-in
  // samurai again if the GLB cannot be loaded. The surface maps (a worker),
  // the reflection map and a GLB's bytes were started by the Hero before
  // this chunk was fetched; these are the same promises, so they are
  // usually settled by now.
  let { textures: texturesReady, env: envPixels, model: modelBytes } = preloadSamurai()
  const modelContext = {
    renderer,
    maxAnisotropy: made.maxAnisotropy,
    integrated,
    breathe: createSlicer(isDisposed),
  }
  const source = modelSource()
  let model
  try {
    model = await loadModel(source, { ...modelContext, data: source ? await modelBytes : null })
  } catch (e) {
    console.warn(`Samurai: could not load ${source}; using the built-in samurai.`, e)
    emit('modelerror', e)
    texturesReady = requestTextures(TEXTURE_QUALITY).catch(() => null)
    model = await loadModel(null, modelContext)
  }
  if (shell.disposed) {
    model.dispose()
    renderer.dispose()
    return
  }

  // The loop's clock, in seconds, shared with everything that schedules.
  const clock = { now: 0 }
  const post = { current: null }
  let dock = null
  let effects = null
  let stage = null

  /** A tier's settings: shadow map size and softness, effect detail. */
  const applyTier = (tier, settings) => {
    if (stage) {
      const { shadow } = stage.lights.key
      if (shadow.mapSize.x !== settings.shadowMap) {
        shadow.mapSize.setScalar(settings.shadowMap)
        // Re-allocated at the new size on the next render.
        shadow.map?.dispose()
        shadow.map = null
      }
      shadow.radius = settings.shadowRadius
    }
    effects?.setDetail({ sparks: settings.sparks, ring: settings.ring, glint: settings.glint })
    emit('quality', tier)
  }

  const quality = createQuality({
    renderer,
    timer,
    mount,
    finePointer,
    integrated,
    info: { gpuName, backend },
    clock,
    post,
    isPaused: () => !!dock?.on,
    onTier: applyTier,
    // Even the lowest rung is too slow: stop drawing for good and let the
    // poster stand in, so the rest of the page stays smooth.
    onStruggle: () => {
      stalled = true
      mount.classList.add('is-lost')
      emit('fallback', 'slow')
    },
  })
  renderer.setPixelRatio(quality.dpr)
  renderer.setSize(mount.clientWidth, mount.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // Kept under 1: ACES desaturates saturated reds toward coral as they
  // approach clipping. A darker exposure keeps the lacquer red.
  renderer.toneMappingExposure = 0.92
  renderer.shadowMap.enabled = true
  // Not PCFSoftShadowMap: three.js r18x silently swaps that for PCF at
  // render time, which changes every shader's cache key and throws away the
  // programs compiled ahead of time. `key.shadow.radius` still softens PCF.
  renderer.shadowMap.type = THREE.PCFShadowMap
  mount.appendChild(renderer.domElement)

  stage = createStage({ renderer, mount, bigShadows: finePointer && !integrated })
  const { scene, camera } = stage
  let envTexture = null
  let envFallback = null

  prepareMaterials(model.materials, model.rim)
  scene.add(model.root)
  // The rim light's colour, from the theme (see applyTheme).
  const rimTint = cssColor('--samurai-rim-color', '#9fc0ff')

  // The page-wide cursor, which his gaze follows.
  const cursor = { x: 0, y: 0, active: false, at: -10 }
  // Filled in once the model is built (see start).
  let rig = null

  /* ---- The loop: runs only while he is on screen and the tab is shown ---- */
  let frame = null
  let started = false
  let stalled = false
  let last = 0
  let gate = null
  const t0 = performance.now()

  // Nothing to draw: off screen, tab hidden, or stepped out of his corner.
  const nothingToDraw = () =>
    !started || stalled || !gate?.visible || document.hidden || !!(dock?.on && dock.hidden)
  function wake() {
    if (frame !== null || nothingToDraw()) return
    last = 0
    frame = requestAnimationFrame(loop)
  }

  // The samurai rig gets the procedural performance; any other rigged
  // character is played from its own clips (see rig.js).
  const makeController = model.rigKind === 'samurai' ? createAnimationController : createMixerController
  const controller = makeController({
    model,
    camera,
    controls: stage.controls,
    canvas: renderer.domElement,
    cursor,
    orbit: stage.orbit,
    clock,
    wake,
    onCue: (name, action) => {
      effects?.cue(name)
      emit('cue', { name, action })
    },
    onState: (state) => emit('state', state),
  })

  // A click, tap or Enter: the cinematic, unless it is already under way.
  const press = () => {
    if (!controller.performing) controller.play('cinematic')
  }
  const interaction = createInteraction({
    mount,
    cursor,
    hitEl,
    slotEl,
    controller,
    stage,
    clock,
    setTip,
    isDisposed,
    onPress: press,
    onCalm: (calm) => effects?.setEnabled(!calm),
  })

  const update = (dt, t) => {
    controller.update(dt, t)
    effects.update(dt, t, { still: controller.still, hover: controller.hoverLevel })
    stage.updateCamera(dt, { seated: controller.seated, rise: interaction.rise, calm: !controller.still })
  }

  function loop() {
    frame = null
    if (nothingToDraw()) return
    frame = requestAnimationFrame(loop)
    const t = still ? 0 : (performance.now() - t0) / 1000
    // Docked, he is small: 30 fps is plenty, and halves the GPU cost.
    if (dock.on && t - last < 1 / 31) return
    const dt = last ? Math.min(t - last, 0.1) : 0
    last = t
    clock.now = t
    update(dt, t)
    const gpuMs = timer?.poll() ?? null
    timer?.begin()
    draw()
    timer?.end()
    quality.govern(dt, gpuMs)
  }
  // Rungs without AO draw straight to the canvas: the off-screen target,
  // its copies and the output pass are a fixed cost worth skipping.
  function draw() {
    if (post.current?.ready && !dock.on && quality.ao > 0) post.current.render()
    else renderer.render(scene, camera)
  }

  gate = createVisibilityGate(mount, wake)
  document.addEventListener('visibilitychange', wake)

  // A lost GPU context or device (driver reset, too many contexts): the
  // poster stands in until three.js restores it.
  const onContextLost = () => {
    mount.classList.add('is-lost')
    emit('contextlost')
  }
  const onContextRestored = () => {
    mount.classList.remove('is-lost')
    emit('contextrestored')
    wake()
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost)
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)
  if (backend === 'webgpu') renderer.onDeviceLost = onContextLost

  dock = createDock({
    frameEl,
    slotEl,
    dismissEl,
    onChange: ({ on }) => {
      stage.setDocked(on)
      interaction.hideTip()
      wake()
    },
  })

  if (import.meta.env.DEV) {
    // For the probe scripts: poke the scene and read the GPU clock.
    window.__samurai = {
      renderer,
      backend,
      model: model.kind,
      scene,
      key: stage.lights.key,
      ladder: quality.ladder,
      get rung() {
        return quality.rung
      },
      setRung: (i) => quality.setRung(i),
      get gpuMs() {
        return quality.gpuMs
      },
      get aoOn() {
        return !!post.current?.ready
      },
      get action() {
        return controller.action
      },
      get state() {
        return controller.state
      },
      get trail() {
        return effects?.trailState ?? null
      },
      get effects() {
        return effects?.debug ?? null
      },
      play: (name, opts) => controller.play(name, opts),
      transition: (state, d) => controller.transitionTo(state, d),
      setHover: (on) => controller.setHover(on),
      setLevel: (level) => quality.setLevel(level),
    }
  }

  // Build the model in slices, compile every shader in parallel (without
  // blocking the page), then start drawing and fade the canvas in. AO
  // follows once the page is idle.
  const start = async () => {
    performance.mark('samurai:build-start')
    try {
      rig = await model.build()
    } catch (e) {
      if (e !== ABORT) {
        console.error(e)
        emit('error', e)
      }
      return
    }
    performance.measure('samurai:build', 'samurai:build-start')

    controller.attach(rig)
    effects = createEffects({ scene, camera, rig, rim: model.rim, rimTint })
    effects.setRimBase(cssNumber('--samurai-rim', 0.04))
    effects.setPage(document.documentElement.dataset.theme)
    effects.setEnabled(!interaction.calm)
    if (quality.settings) effects.setDetail(quality.settings)

    const pixels = await envPixels
    if (shell.disposed) return
    if (pixels) envTexture = decodeBakedEnvironment(pixels)
    model.fillTextures(await texturesReady)
    if (shell.disposed) return
    if (!envTexture) {
      envFallback = studioEnvironment()
      envTexture = envFallback.texture
    }
    scene.environment = envTexture
    performance.mark('samurai:compile-start')
    try {
      await renderer.compileAsync(scene, camera)
    } catch {
      // Fall back to compiling on first render.
    }
    if (shell.disposed) return
    performance.measure('samurai:compile', 'samurai:compile-start')
    // One warm frame while the canvas is still invisible uploads every
    // geometry and texture, so the fade-in begins on a frame that is ready.
    update(0, 0)
    renderer.render(scene, camera)
    performance.measure('samurai:ready', 'samurai:build-start')
    started = true
    controller.markStarted()
    mount.classList.add('is-ready')
    dock.enable()
    wake()
    emit('ready')
    if (finePointer) {
      const whenIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400))
      whenIdle(() => {
        if (shell.disposed) return
        // Compiling the chain can stall a frame or two: not the GPU's fault,
        // so the governor does not judge them.
        quality.hold(true)
        createPost({
          renderer,
          scene,
          camera,
          mount,
          transient: () => [...rig.glows, ...effects.transient],
          onReady: (chain) => {
            post.current = chain
            quality.apply()
          },
          isDisposed,
        })
          .catch(() => null)
          .finally(() => quality.hold(false))
      })
    }
  }
  start()

  /* ---- Theme ---- */
  const applyTheme = () => {
    model.applyTheme()
    stage.applyTheme()
    rimTint.copy(cssColor('--samurai-rim-color', '#9fc0ff'))
    effects?.setRimBase(cssNumber('--samurai-rim', 0.04))
    effects?.setPage(document.documentElement.dataset.theme)
    wake()
  }
  const themeWatcher = new MutationObserver(applyTheme)
  themeWatcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  /* ---- Resize ---- */
  const onResize = () => {
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (!w || !h) return
    stage.resize(w, h)
    quality.apply()
  }
  const resizeWatcher = new ResizeObserver(onResize)
  resizeWatcher.observe(mount)

  shell.impl = {
    controller,
    quality,
    started: () => started,
    qualityInfo: () => ({
      tier: quality.tier,
      level: quality.level,
      dpr: quality.dpr,
      post: !!post.current?.ready,
      backend,
      model: model.kind,
    }),
    setInteractionState(state) {
      if (typeof state === 'object' && state) {
        if ('hover' in state) controller.setHover(!!state.hover)
        return
      }
      if (state === 'hover' || state === 'focus') controller.setHover(true)
      else if (state === 'idle') controller.setHover(false)
      else if (state === 'active' || state === 'pressed') press()
    },
    snapshot(type = 'image/png', encoderQuality) {
      if (!started) return null
      draw()
      return renderer.domElement.toDataURL(type, encoderQuality)
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame)
      gate.dispose()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      document.removeEventListener('visibilitychange', wake)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
      interaction.dispose()
      dock.dispose()
      mount.classList.remove('is-ready', 'is-lost')
      timer?.dispose()
      made.releaseShared?.(model.materials)
      effects?.dispose()
      stage.dispose()
      model.dispose()
      post.current?.dispose()
      // The baked texture is shared across mounts; this only frees this
      // renderer's GPU copy; it re-uploads if the component mounts again.
      envTexture?.dispose()
      envFallback?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
      if (import.meta.env.DEV && window.__samurai?.renderer === renderer) delete window.__samurai
    },
  }
  if (shell.level) quality.setLevel(shell.level)
}

/** ?samurai-renderer=webgl | webgpu | auto picks a renderer, for testing. */
function rendererOverride() {
  try {
    const value = new URLSearchParams(window.location.search).get('samurai-renderer')
    return ['webgl', 'webgpu', 'auto'].includes(value) ? value : null
  } catch {
    return null
  }
}
