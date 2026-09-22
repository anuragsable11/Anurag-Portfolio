import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  addLights,
  createRenderer,
  createVisibilityGate,
  cssColor,
} from '../lib/three-utils.js'

/**
 * An original robot character, assembled from primitives.
 *
 * A legless assistant bot that hovers over a ring: boxy head with a visor,
 * two lamp eyes that track the cursor and blink, a signal antenna, a chest
 * indicator and two swaying arms. Everything is built here from geometry and
 * the site's own theme colours.
 */
export default function Robot3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = createRenderer(mount)
    if (!renderer) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      38,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 0.2, 6.4)
    camera.lookAt(0, -0.1, 0)

    addLights(scene)

    const robot = new THREE.Group()
    scene.add(robot)

    /* ---- Palette ---- */
    let brand = cssColor('--brand', '#2584f5')
    let shell = cssColor('--robot-shell', '#c9d2de')
    let plate = cssColor('--robot-plate', '#8b97a8')

    const shellMat = new THREE.MeshStandardMaterial({
      color: shell,
      roughness: 0.42,
      metalness: 0.28,
    })
    const plateMat = new THREE.MeshStandardMaterial({
      color: plate,
      roughness: 0.55,
      metalness: 0.2,
    })
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x11161f,
      roughness: 0.22,
      metalness: 0.5,
    })
    const glowMat = new THREE.MeshStandardMaterial({
      color: brand,
      emissive: brand,
      emissiveIntensity: 1.5,
      roughness: 0.3,
    })

    /* ---- Head ---- */
    const head = new THREE.Group()
    head.position.y = 0.92
    robot.add(head)

    const skull = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.18, 1.12, 5, 0.26), shellMat)
    head.add(skull)

    // Visor band across the face
    const visor = new THREE.Mesh(new RoundedBoxGeometry(1.24, 0.5, 0.18, 4, 0.12), visorMat)
    visor.position.set(0, 0.06, 0.54)
    head.add(visor)

    // Lamp eyes
    const eyeGeo = new THREE.CapsuleGeometry(0.1, 0.1, 6, 14)
    const eyes = [-0.27, 0.27].map((x) => {
      const eye = new THREE.Mesh(eyeGeo, glowMat)
      eye.position.set(x, 0.06, 0.64)
      eye.rotation.x = Math.PI / 2
      head.add(eye)
      return eye
    })

    // Ear plates
    const earGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 20)
    ;[-0.79, 0.79].forEach((x) => {
      const ear = new THREE.Mesh(earGeo, plateMat)
      ear.position.set(x, 0.02, 0)
      ear.rotation.z = Math.PI / 2
      head.add(ear)
    })

    // Antenna
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.46, 10),
      plateMat
    )
    antenna.position.set(0, 0.8, -0.05)
    head.add(antenna)

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 20), glowMat)
    beacon.position.set(0, 1.06, -0.05)
    head.add(beacon)

    /* ---- Body ---- */
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.24, 1.14, 0.94, 5, 0.24), shellMat)
    body.position.y = -0.34
    robot.add(body)

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.2, 20),
      plateMat
    )
    collar.position.y = 0.28
    robot.add(collar)

    // Chest indicator
    const chest = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 12, 28), glowMat)
    chest.position.set(0, -0.28, 0.5)
    robot.add(chest)

    /* ---- Arms ---- */
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.5, 6, 14)
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.74, -0.06, 0)
      robot.add(pivot)

      const arm = new THREE.Mesh(armGeo, plateMat)
      arm.position.y = -0.38
      pivot.add(arm)

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 18), shellMat)
      hand.position.y = -0.74
      pivot.add(hand)

      pivot.rotation.z = side * 0.16
      return { pivot, side }
    })

    /* ---- Hover ring ---- */
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.035, 12, 60),
      new THREE.MeshBasicMaterial({ color: brand, transparent: true, opacity: 0.4 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = -1.45
    robot.add(ring)

    /* ---- Cursor tracking ---- */
    const look = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    const onPointerMove = (e) => {
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

      // Hover bob and gentle sway
      robot.position.y = Math.sin(t * 1.1) * 0.1
      robot.rotation.z = Math.sin(t * 0.7) * 0.025

      // Head follows the cursor, within a polite range
      look.x += (target.x - look.x) * 0.06
      look.y += (target.y - look.y) * 0.06
      head.rotation.y = look.x * 0.5
      head.rotation.x = look.y * 0.3
      robot.rotation.y = look.x * 0.22

      // Eyes blink on an irregular schedule
      nextBlink -= delta
      let eyeScale = 1
      if (nextBlink < 0.14) {
        eyeScale = Math.max(0.08, Math.abs(nextBlink / 0.07 - 1))
        if (nextBlink <= 0) nextBlink = 2.5 + Math.random() * 3.5
      }
      eyes.forEach((eye) => eye.scale.set(1, eyeScale, 1))

      // Beacon and chest pulse
      const pulse = 1.1 + Math.sin(t * 2.6) * 0.5
      glowMat.emissiveIntensity = pulse
      beacon.scale.setScalar(1 + Math.sin(t * 2.6) * 0.08)

      // Arms idle
      arms.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (0.16 + Math.sin(t * 1.3 + side) * 0.05)
        pivot.rotation.x = Math.sin(t * 0.9 + side * 1.5) * 0.08
      })

      // Hover ring breathes
      ring.scale.setScalar(1 + Math.sin(t * 1.1 + 1) * 0.06)
      ring.material.opacity = 0.28 + Math.sin(t * 1.1) * 0.1

      renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    /* ---- Theme ---- */
    const applyTheme = () => {
      brand = cssColor('--brand', '#2584f5')
      shell = cssColor('--robot-shell', '#c9d2de')
      plate = cssColor('--robot-plate', '#8b97a8')
      shellMat.color.copy(shell)
      plateMat.color.copy(plate)
      glowMat.color.copy(brand)
      glowMat.emissive.copy(brand)
      ring.material.color.copy(brand)
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
      gate.dispose()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)

      scene.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose()
      })
      ;[shellMat, plateMat, visorMat, glowMat, ring.material].forEach((m) => m.dispose())
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="robot3d" ref={mountRef} aria-hidden="true">
      <span className="robot3d-caption">Say hi — it follows your cursor</span>
    </div>
  )
}
