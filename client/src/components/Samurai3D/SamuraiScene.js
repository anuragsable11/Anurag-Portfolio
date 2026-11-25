import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { cssNumber } from '../../lib/three-utils.js'
import { SIT_TARGET_Y, STAND_TARGET_Y } from './constants.js'
import { blendGlowLinear, clamp, dampAngle, dampTo, lerp } from './util.js'

const UP = new THREE.Vector3(0, 1, 0)

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
     Studio lighting: warm key, a cool cyan rim and a warm one behind
     him, a soft warm fill, the studio's reflections
     ================================================================ */
  // Balanced for ACES Filmic at exposure 1.25 (SamuraiEngine): that curve
  // lifts the mid-tones about a stop above the old neutral one, so every
  // light here is about two thirds as strong as it used to be — the same
  // picture, with the filmic curve's deep blacks and soft highlights.

  // The reflection map arrives asynchronously (see the engine's start()).
  // Metals are lit mostly by what they reflect — the blade, the gilt, the
  // lacquer's clear coat — so it carries more weight than in a matte scene.
  scene.environmentIntensity = 0.4

  // The key: warm, high and to the front, the only light that casts a
  // shadow.
  const key = new THREE.DirectionalLight(0xffe2c2, 1.6)
  key.name = 'key'
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

  // The rims stand behind him, as a photographer's strip lights do: from the
  // usual three-quarter view they only graze his edges (helmet, shikoro,
  // sode, arms, blade), carving the silhouette out of a dark page while the
  // faces turned to the viewer stay black. The cool one — cyan-blue, on the
  // shadow side, opposite the warm key — is the cinematic one; it sits well
  // behind and above him, because moved round to his side it would lay a
  // broad blue sheen over the black lacquer (lacquer tinted blue reads as
  // plastic). Pale rather than saturated for the same reason: its colour
  // shows on the edges and the steel, not on the faces. The warm rim traces
  // the key side's outline.
  const rimCool = new THREE.DirectionalLight(0x7fd0ff, 4)
  rimCool.name = 'rim-cool'
  rimCool.position.set(4, 6, -8)
  const rimWarm = new THREE.DirectionalLight(0xffe9d6, 3)
  rimWarm.name = 'rim-warm'
  rimWarm.position.set(-5, 3.5, -7)
  // The fill: a warm sky over a dark floor. It lights no highlights of its
  // own (a hemisphere light is diffuse only), so it costs next to nothing
  // and can't blow out the lacquer; the baked occlusion still darkens it in
  // every crease and between the plates, which keeps them deep. Kept low:
  // the studio's reflections are most of the fill.
  const fill = new THREE.HemisphereLight(0xffcf9e, 0x0d1117, 0.25)
  fill.name = 'fill'
  scene.add(key, rimCool, rimWarm, fill)
  // The studio turns with the view, as if he stood on a turntable: dragged
  // round, he is lit from every side as he is from the front — the key on
  // his face, the rims behind — and his reflections and shadow turn with it,
  // rather than the rims blazing at the viewer once his back is turned.
  // (The fill needs no turning: it is the same from every side.)
  const studio = [key, rimCool, rimWarm].map((light) => ({ light, home: light.position.clone() }))
  let studioTurn = 0
  const turnStudio = (angle) => {
    if (Math.abs(angle - studioTurn) < 1e-5) return
    studioTurn = angle
    for (const { light, home } of studio) light.position.copy(home).applyAxisAngle(UP, angle)
    scene.environmentRotation.y = angle
  }

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
  // Blended in linear light on every path (see blendGlowLinear), so every
  // quality level shows the same pool.
  if (renderer.isWebGLRenderer) blendGlowLinear(floorGlowMat)
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

  /* ---- Parallax: the view floats after the cursor ---- */
  // Wherever the cursor is on the page, he turns a few degrees toward it
  // and tips his face to it: the camera swings round him the opposite way
  // (so his feet stay planted), with a hair of roll. It follows with
  // inertia rather than tracking — easing PARALLAX.lerp of the remaining
  // way every 60th of a second, the same glide at any frame rate and
  // through a dropped frame. The studio turns with the true view only
  // (turnStudio), so as the view floats, the highlights slide across the
  // lacquer, gilt and steel. Off while docked, mid-drag, without a mouse,
  // and under reduced motion.
  //   yaw / pitch / roll: radians with the cursor half a window away
  const PARALLAX = { lerp: 0.05, yaw: 0.07, pitch: 0.035, roll: 0.008 }
  const parallax = { x: 0, y: 0, on: false }
  const trueView = new THREE.Vector3()
  // Where the canvas sits and how big the window is, read a few times a
  // second at most: reading layout every frame could force one while the
  // page is animating.
  const where = { cx: 0, cy: 0, halfW: 1, halfH: 1, at: -Infinity }
  const measure = () => {
    const r = renderer.domElement.getBoundingClientRect()
    where.cx = r.left + r.width / 2
    where.cy = r.top + r.height / 2
    where.halfW = (window.innerWidth || 2) / 2
    where.halfH = (window.innerHeight || 2) / 2
    where.at = performance.now()
  }
  const updateParallax = (dt, cursor, calm) => {
    let gx = 0
    let gy = 0
    if (cursor?.active && !docked && !orbit.interacting && !calm) {
      if (performance.now() - where.at > 250) measure()
      // From his own centre: a cursor on him leaves him square to the
      // viewer, one over the text beside him turns him toward the text.
      gx = clamp((cursor.x - where.cx) / where.halfW, -1, 1)
      gy = clamp((cursor.y - where.cy) / where.halfH, -1, 1)
    }
    const k = 1 - Math.pow(1 - PARALLAX.lerp, dt * 60)
    parallax.x += (gx - parallax.x) * k
    parallax.y += (gy - parallax.y) * k
    parallax.on = Math.abs(parallax.x) + Math.abs(parallax.y) > 1e-4
    if (!parallax.on) return
    trueView.copy(camera.position)
    offset.copy(camera.position).sub(controls.target)
    spherical.setFromVector3(offset)
    // Swinging the camera the other way turns him toward the cursor, and
    // dropping it a little lifts his face toward a cursor above him.
    spherical.theta -= parallax.x * PARALLAX.yaw
    spherical.phi = clamp(spherical.phi - parallax.y * PARALLAX.pitch, 0.05, Math.PI - 0.05)
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
    camera.lookAt(controls.target)
    camera.rotateZ(-parallax.x * PARALLAX.roll)
  }

  /**
   * One frame of camera motion. `seated` is how far into seiza he is (0..1):
   * the aim drops with him. `rise` (0..1, how far the hero has scrolled
   * away) lifts the camera a few degrees, so he is seen a touch more from
   * above as the page moves on. `calm` (reduced motion) holds it still.
   * `cursor` ({ x, y, active }, page-wide) floats the view (parallax).
   */
  const updateCamera = (dt, { seated, rise = 0, calm = false, cursor = null }) => {
    // Last frame's parallax was for the picture only: the orbit, a drag and
    // the way home all work from the true view.
    if (parallax.on) camera.position.copy(trueView)
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
    // Wherever the view has swung round him, the studio has swung too.
    turnStudio(Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) - HOME.theta)
    updateParallax(dt, cursor, calm)
  }

  return {
    scene,
    camera,
    controls,
    orbit,
    lights: { key, rimCool, rimWarm, fill },
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
      // The key's shadow map is a render target of its own (2k–4k square):
      // disposing the light frees it on the GPU now, not whenever the
      // context happens to go.
      for (const light of [key, rimCool, rimWarm, fill]) light.dispose()
      geos.forEach((g) => g.dispose())
      shadowMat.dispose()
      poolMat.dispose()
      poolTex.dispose()
      floorGlowMat.dispose()
      floorGlowTex.dispose()
    },
  }
}
