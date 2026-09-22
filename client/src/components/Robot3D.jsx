import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createVisibilityGate, cssColor } from '../lib/three-utils.js'

/**
 * An original robot character, modelled from primitives and fully orbitable.
 *
 * A legless assistant bot: boxy head with a visor, lamp eyes that blink, a
 * signal antenna, chest indicator, shoulder joints, and a vented thruster
 * pack on its back so it holds up from every angle.
 *
 * Drag to orbit a full 360°. Lit with image-based lighting and soft shadows.
 */
export default function Robot3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    /* ---- Renderer: high quality ---- */
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      36,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(1.6, 0.9, 6.4)

    /* ---- Image-based lighting for believable metal ---- */
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture

    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(3.5, 5.5, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 20
    key.shadow.camera.left = -4
    key.shadow.camera.right = 4
    key.shadow.camera.top = 4
    key.shadow.camera.bottom = -4
    key.shadow.bias = -0.0012
    key.shadow.radius = 3

    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-4, 1, -3)
    scene.add(key, fill)

    /* ---- Controls: full 360 orbit ---- */
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, -0.05, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    // Wheel zoom would swallow page scrolling in a hero, so it stays off.
    controls.enableZoom = false
    controls.rotateSpeed = 0.85
    controls.minPolarAngle = 0.3
    controls.maxPolarAngle = Math.PI - 0.42
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.9

    // Touch drags orbit as well. OrbitControls otherwise pins the canvas to
    // `touch-action: none`, which swallows page scrolling, so it is put back
    // to `pan-y`: a sideways drag spins the robot, while a vertical swipe is
    // claimed by the browser to scroll and cancels the drag mid-gesture.
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null }
    renderer.domElement.style.touchAction = 'pan-y'

    let interacting = false
    let resumeTimer
    controls.addEventListener('start', () => {
      interacting = true
      controls.autoRotate = false
      clearTimeout(resumeTimer)
    })
    controls.addEventListener('end', () => {
      interacting = false
      resumeTimer = setTimeout(() => {
        controls.autoRotate = true
      }, 2500)
    })

    /* ---- Palette ---- */
    let brand = cssColor('--brand', '#2584f5')
    let shellColor = cssColor('--robot-shell', '#ccd5e0')
    let plateColor = cssColor('--robot-plate', '#8d99ab')

    const shellMat = new THREE.MeshStandardMaterial({
      color: shellColor,
      roughness: 0.32,
      metalness: 0.55,
      envMapIntensity: 0.9,
    })
    const plateMat = new THREE.MeshStandardMaterial({
      color: plateColor,
      roughness: 0.45,
      metalness: 0.7,
      envMapIntensity: 0.8,
    })
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0d1117,
      roughness: 0.08,
      metalness: 0.9,
      envMapIntensity: 1.2,
    })
    const glowMat = new THREE.MeshStandardMaterial({
      color: brand,
      emissive: brand,
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0,
    })

    const robot = new THREE.Group()
    scene.add(robot)

    const castAll = (mesh) => {
      mesh.castShadow = true
      mesh.receiveShadow = true
      return mesh
    }

    /* ---- Head ---- */
    const head = new THREE.Group()
    head.position.y = 0.95
    robot.add(head)

    head.add(castAll(new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.2, 1.16, 6, 0.26), shellMat)))

    // Visor band, wrapping slightly around the face
    const visor = castAll(
      new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.52, 0.2, 5, 0.13), visorMat)
    )
    visor.position.set(0, 0.07, 0.55)
    head.add(visor)

    // Lamp eyes
    const eyeGeo = new THREE.CapsuleGeometry(0.095, 0.11, 8, 20)
    const eyes = [-0.27, 0.27].map((x) => {
      const eye = new THREE.Mesh(eyeGeo, glowMat)
      eye.position.set(x, 0.07, 0.655)
      eye.rotation.x = Math.PI / 2
      head.add(eye)
      return eye
    })

    // Ear discs
    const earGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.16, 28)
    ;[-0.8, 0.8].forEach((x) => {
      const ear = castAll(new THREE.Mesh(earGeo, plateMat))
      ear.position.set(x, 0.03, 0)
      ear.rotation.z = Math.PI / 2
      head.add(ear)

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.19, 20), glowMat)
      cap.position.set(x * 1.03, 0.03, 0)
      cap.rotation.z = Math.PI / 2
      head.add(cap)
    })

    // Rear head plate, so the back of the head is not a blank box
    const headPlate = castAll(
      new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.62, 0.1, 4, 0.06), plateMat)
    )
    headPlate.position.set(0, 0.02, -0.58)
    head.add(headPlate)

    // Antenna
    const antenna = castAll(
      new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.5, 14), plateMat)
    )
    antenna.position.set(0, 0.84, -0.06)
    head.add(antenna)

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 28), glowMat)
    beacon.position.set(0, 1.12, -0.06)
    head.add(beacon)

    /* ---- Neck ---- */
    const neck = castAll(
      new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.24, 24), plateMat)
    )
    neck.position.y = 0.3
    robot.add(neck)

    /* ---- Body ---- */
    const body = castAll(
      new THREE.Mesh(new RoundedBoxGeometry(1.28, 1.2, 0.98, 6, 0.24), shellMat)
    )
    body.position.y = -0.36
    robot.add(body)

    // Chest indicator
    const chest = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 16, 40), glowMat)
    chest.position.set(0, -0.3, 0.51)
    robot.add(chest)

    const chestCore = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), glowMat)
    chestCore.position.set(0, -0.3, 0.5)
    robot.add(chestCore)

    /* ---- Back: thruster pack and vents ---- */
    const pack = castAll(
      new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.78, 0.3, 5, 0.1), plateMat)
    )
    pack.position.set(0, -0.3, -0.58)
    robot.add(pack)

    const ventGeo = new THREE.BoxGeometry(0.62, 0.05, 0.06)
    for (let i = 0; i < 4; i++) {
      const vent = new THREE.Mesh(ventGeo, visorMat)
      vent.position.set(0, -0.05 - i * 0.14, -0.74)
      robot.add(vent)
    }

    const thrusters = [-0.3, 0.3].map((x) => {
      const housing = castAll(
        new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.26, 24), plateMat)
      )
      housing.position.set(x, -0.74, -0.6)
      housing.rotation.x = Math.PI / 2
      robot.add(housing)

      const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.02, 0.3, 20), glowMat)
      flame.position.set(x, -0.74, -0.78)
      flame.rotation.x = Math.PI / 2
      robot.add(flame)
      return flame
    })

    /* ---- Shoulders and arms ---- */
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.52, 8, 20)
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.76, -0.08, 0)
      robot.add(pivot)

      const joint = castAll(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), plateMat))
      pivot.add(joint)

      const arm = castAll(new THREE.Mesh(armGeo, shellMat))
      arm.position.y = -0.42
      pivot.add(arm)

      const hand = castAll(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), plateMat))
      hand.position.y = -0.8
      pivot.add(hand)

      pivot.rotation.z = side * 0.16
      return { pivot, side }
    })

    /* ---- Contact shadow ---- */
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.22 })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), shadowMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.62
    floor.receiveShadow = true
    scene.add(floor)

    /* ---- Cursor tracking (only while not orbiting) ---- */
    const look = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    const onPointerMove = (e) => {
      if (interacting) return
      const rect = mount.getBoundingClientRect()
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    const onPointerLeave = () => {
      target.x = 0
      target.y = 0
    }
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)

    /* ---- Animation ---- */
    const clock = new THREE.Clock()
    let frame = null
    let nextBlink = 2 + Math.random() * 3

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible) return

      const delta = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      robot.position.y = Math.sin(t * 1.1) * 0.1
      robot.rotation.z = Math.sin(t * 0.7) * 0.022

      look.x += (target.x - look.x) * 0.06
      look.y += (target.y - look.y) * 0.06
      head.rotation.y = look.x * 0.45
      head.rotation.x = look.y * 0.26

      nextBlink -= delta
      let eyeScale = 1
      if (nextBlink < 0.14) {
        eyeScale = Math.max(0.08, Math.abs(nextBlink / 0.07 - 1))
        if (nextBlink <= 0) nextBlink = 2.5 + Math.random() * 3.5
      }
      eyes.forEach((eye) => eye.scale.set(1, eyeScale, 1))

      const pulse = 1.2 + Math.sin(t * 2.6) * 0.5
      glowMat.emissiveIntensity = pulse
      beacon.scale.setScalar(1 + Math.sin(t * 2.6) * 0.08)
      chestCore.scale.setScalar(1 + Math.sin(t * 2.2) * 0.1)
      thrusters.forEach((flame, i) => {
        flame.scale.set(1, 0.8 + Math.sin(t * 6 + i) * 0.22, 1)
      })

      arms.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (0.16 + Math.sin(t * 1.3 + side) * 0.05)
        pivot.rotation.x = Math.sin(t * 0.9 + side * 1.5) * 0.08
      })

      controls.update()
      renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    /* ---- Theme ---- */
    const applyTheme = () => {
      brand = cssColor('--brand', '#2584f5')
      shellColor = cssColor('--robot-shell', '#ccd5e0')
      plateColor = cssColor('--robot-plate', '#8d99ab')
      shellMat.color.copy(shellColor)
      plateMat.color.copy(plateColor)
      glowMat.color.copy(brand)
      glowMat.emissive.copy(brand)
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
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const resizeWatcher = new ResizeObserver(onResize)
    resizeWatcher.observe(mount)

    /* ---- Teardown ---- */
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      clearTimeout(resumeTimer)
      gate.dispose()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)
      controls.dispose()

      scene.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose()
      })
      ;[shellMat, plateMat, visorMat, glowMat, shadowMat].forEach((m) => m.dispose())
      envRT.texture.dispose()
      pmrem.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div className="robot3d" ref={mountRef} />
}
