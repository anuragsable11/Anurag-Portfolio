import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { cssNumber } from '../../lib/three-utils.js'
import { SIT_TARGET_Y, STAND_TARGET_Y } from './constants.js'
import { dampAngle, dampTo, lerp } from './util.js'

/**
 * The stage the samurai stands on: camera, orbit controls, studio lights and
 * the ground. Nothing here is a set — no floor surface is drawn, only his
 * shadow, a soft contact pool and (on the dark page) the pool of light he
 * stands in, so he sits on the page itself.
 *
 *   renderer     the WebGL or WebGPU renderer (its canvas takes the drags)
 *   mount        the element the canvas fills
 *   bigShadows   4k shadow map (discrete desktop GPUs) instead of 2k
 */
export function createStage({ renderer, mount, bigShadows }) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(31, mount.clientWidth / mount.clientHeight, 0.1, 100)
  // A three-quarter view from his sword side.
  camera.position.set(-1.4, 2.6, 8.8)

  /* ================================================================
     Studio lighting: warm key, two cool rims, dim fill
     ================================================================ */
  // The reflection map arrives asynchronously (see the engine's start()).
  // Metals are lit mostly by what they reflect, so it carries more weight
  // than it would in a matte scene.
  scene.environmentIntensity = 0.62

  const key = new THREE.DirectionalLight(0xfff3e6, 2.5)
  key.position.set(-3.6, 6.5, 5.2)
  key.castShadow = true
  // A 4k map is a 16-megapixel depth pass every frame: discrete GPUs only.
  key.shadow.mapSize.setScalar(bigShadows ? 4096 : 2048)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 30
  key.shadow.camera.left = -4
  key.shadow.camera.right = 4
  key.shadow.camera.top = 6
  key.shadow.camera.bottom = -1.5
  key.shadow.bias = -0.0006
  key.shadow.normalBias = 0.018
  key.shadow.radius = bigShadows ? 7 : 4

  // The rims sit well out to the sides, so from the usual three-quarter view
  // they trace his silhouette (helmet, sode, arms, shins) in cool light and
  // lift the black lacquer off a dark page.
  const rimL = new THREE.DirectionalLight(0xa8c8ff, 5)
  rimL.position.set(6, 4, -2.5)
  const rimR = new THREE.DirectionalLight(0xbcd4ff, 3.3)
  rimR.position.set(-6, 3, -2.5)
  const fill = new THREE.DirectionalLight(0xdfe7f5, 0.3)
  fill.position.set(3.5, 1.2, 4)
  scene.add(key, rimL, rimR, fill)

  /* ---- Controls ---- */
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, STAND_TARGET_Y, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.enablePan = false
  controls.enableZoom = false
  controls.rotateSpeed = 0.85
  controls.minPolarAngle = 0.35
  controls.maxPolarAngle = Math.PI / 2 + 0.3
  // No turntable: he faces the visitor, so he can look at them. A drag
  // still turns him all the way round, and he comes back to face them.
  controls.autoRotate = false

  // Touch drags orbit as well. OrbitControls otherwise pins the canvas to
  // `touch-action: none`, which swallows page scrolling, so it is put back
  // to `pan-y`: a sideways drag spins the samurai, while a vertical swipe
  // is claimed by the browser to scroll and cancels the drag mid-gesture.
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null }
  renderer.domElement.style.touchAction = 'pan-y'

  // While the visitor drags, the cursor-follow pauses; a moment after they
  // let go, the camera eases back to the home view.
  const orbit = { interacting: false, releasedAt: -Infinity }
  const onStart = () => {
    orbit.interacting = true
  }
  const onEnd = () => {
    orbit.interacting = false
    orbit.releasedAt = performance.now()
  }
  controls.addEventListener('start', onStart)
  controls.addEventListener('end', onEnd)

  /* ================================================================
     Ground — shadow map, a painted contact pool, and (dark theme) the
     pool of light he stands in
     ================================================================ */
  const geos = []
  const shadowMat = new THREE.ShadowMaterial({ opacity: cssNumber('--samurai-shadow', 0.4) })
  // Only as large as his longest shadow (the crest at the top of a leap
  // throws it about 4.3 units): every pixel of this plane samples the shadow
  // map, so floor nobody can see shadowed is floor not worth shading.
  const floorGeo = new THREE.CircleGeometry(6, 64)
  geos.push(floorGeo)
  const floor = new THREE.Mesh(floorGeo, shadowMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const poolCanvas = document.createElement('canvas')
  poolCanvas.width = poolCanvas.height = 256
  const pctx = poolCanvas.getContext('2d')
  const grad = pctx.createRadialGradient(128, 128, 4, 128, 128, 124)
  grad.addColorStop(0, 'rgba(0,0,0,0.5)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.2)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  pctx.fillStyle = grad
  pctx.fillRect(0, 0, 256, 256)

  const poolTex = new THREE.CanvasTexture(poolCanvas)
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    transparent: true,
    depthWrite: false,
  })
  const poolGeo = new THREE.PlaneGeometry(3.2, 3.2)
  geos.push(poolGeo)
  const pool = new THREE.Mesh(poolGeo, poolMat)
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.012
  scene.add(pool)

  // On a dark page a shadow has nothing to fall on, and he floats. So the
  // key light lands on the floor as a soft pool, drawn beneath the shadow
  // so the shadow darkens it. It fades out well inside the frame at every
  // orbit angle, so the canvas edge never cuts it. Same program as the
  // contact pool.
  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = glowCanvas.height = 256
  const gctx = glowCanvas.getContext('2d')
  const glowGrad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  glowGrad.addColorStop(0, 'rgba(255,255,255,1)')
  glowGrad.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  glowGrad.addColorStop(0.7, 'rgba(255,255,255,0.18)')
  glowGrad.addColorStop(1, 'rgba(255,255,255,0)')
  gctx.fillStyle = glowGrad
  gctx.fillRect(0, 0, 256, 256)
  const floorGlowTex = new THREE.CanvasTexture(glowCanvas)
  floorGlowTex.colorSpace = THREE.SRGBColorSpace
  const floorGlowMat = new THREE.MeshBasicMaterial({
    map: floorGlowTex,
    color: key.color,
    transparent: true,
    depthWrite: false,
  })
  // The post-processed frames (and WebGPU's) blend the pool in linear light
  // and tone-map the result; WebGL drawing straight to the canvas blends
  // after encoding, which darkens the soft falloff to a third. So on that
  // path the pool is tone-mapped at its blended strength and written
  // premultiplied, and every quality level shows the same pool.
  if (renderer.isWebGLRenderer) {
    floorGlowMat.premultipliedAlpha = true
    floorGlowMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <tonemapping_fragment>',
          '#ifdef TONE_MAPPING\n\tgl_FragColor.rgb = toneMapping( gl_FragColor.rgb * gl_FragColor.a );\n#endif'
        )
        .replace(
          '#include <premultiplied_alpha_fragment>',
          '#ifndef TONE_MAPPING\n\tgl_FragColor.rgb *= gl_FragColor.a;\n#endif'
        )
    }
  }
  const floorGlowGeo = new THREE.PlaneGeometry(3.4, 3.4)
  geos.push(floorGlowGeo)
  const floorGlow = new THREE.Mesh(floorGlowGeo, floorGlowMat)
  floorGlow.rotation.x = -Math.PI / 2
  floorGlow.position.y = 0.001
  floorGlow.renderOrder = -1
  scene.add(floorGlow)

  // Docked, he floats over page content: no floor to light.
  let docked = false
  const applyTheme = () => {
    shadowMat.opacity = cssNumber('--samurai-shadow', 0.4)
    floorGlowMat.opacity = cssNumber('--samurai-floor-light', 0)
    floorGlow.visible = !docked && floorGlowMat.opacity > 0
  }
  applyTheme()

  /* ---- Camera: the home view, a drag, or a fixed three-quarter view docked ---- */
  const spherical = new THREE.Spherical()
  const offset = new THREE.Vector3()
  // Home: wherever the camera is after its first frame — a three-quarter
  // view from a little to his right, the sword side (tools may pose it
  // differently).
  let HOME = null
  // Docked, he turns a little toward the page content on his right.
  const DOCK = { theta: 0.42, phi: Math.PI / 2 - 0.1, radius: 8.1, aimY: 1.9 }
  // Seconds after a drag before the camera starts home.
  const RETURN_AFTER = 1.6

  /**
   * One frame of camera motion. `seated` is how far into seiza he is (0..1):
   * the aim drops with him. `rise` (0..1, how far the hero has scrolled
   * away) lifts the camera a few degrees, so he is seen a touch more from
   * above as the page moves on. `calm` (reduced motion) holds it still.
   */
  const updateCamera = (dt, { seated, rise = 0, calm = false }) => {
    const aimY = lerp(docked ? DOCK.aimY : STAND_TARGET_Y, SIT_TARGET_Y, seated)
    camera.position.y += aimY - controls.target.y
    controls.target.y = aimY
    offset.copy(camera.position).sub(controls.target)
    spherical.setFromVector3(offset)
    if (docked) {
      spherical.theta = dampAngle(spherical.theta, DOCK.theta, 4, dt)
      spherical.phi = dampTo(spherical.phi, DOCK.phi, 4, dt)
    } else if (HOME && !orbit.interacting && performance.now() - orbit.releasedAt > RETURN_AFTER * 1000) {
      // Home again, unhurried: a quarter of the way in about half a second.
      spherical.theta = dampAngle(spherical.theta, HOME.theta, 1.8, dt)
      spherical.phi = dampTo(spherical.phi, HOME.phi - (calm ? 0 : 0.07 * rise), 1.8, dt)
    }
    if (HOME) spherical.radius = dampTo(spherical.radius, docked ? DOCK.radius : HOME.radius, 4, dt)
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
    controls.update(dt)
    if (!HOME) HOME = new THREE.Spherical().setFromVector3(offset.copy(camera.position).sub(controls.target))
  }

  return {
    scene,
    camera,
    controls,
    orbit,
    lights: { key, rimL, rimR, fill },
    ground: { floor, pool, floorGlow },
    applyTheme,
    updateCamera,
    /** Docked in the corner: a fixed three-quarter view and no floor light. */
    setDocked(on) {
      docked = on
      floorGlow.visible = !on && floorGlowMat.opacity > 0
      controls.enableRotate = !on
    },
    resize(width, height) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },
    dispose() {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      // OrbitControls removes its keydown listener from the canvas's root
      // node — the document while the canvas is in it. React runs effect
      // clean-ups after detaching the DOM, when the root is no longer the
      // document, and the listener (holding the canvas, and through it the
      // whole renderer) would stay on the document for good. So the canvas
      // is put back for the moment the clean-up takes: one synchronous
      // task, so nothing is ever painted.
      const canvas = renderer.domElement
      const detached = !canvas.isConnected
      if (detached) document.body.appendChild(canvas)
      controls.dispose()
      if (detached) canvas.remove()
      geos.forEach((g) => g.dispose())
      shadowMat.dispose()
      poolMat.dispose()
      poolTex.dispose()
      floorGlowMat.dispose()
      floorGlowTex.dispose()
    },
  }
}
