import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  addLights,
  createRenderer,
  createVisibilityGate,
  cssColor,
} from '../lib/three-utils.js'

/**
 * An agent runtime, drawn as a living graph.
 *
 * Five nodes — client, API, queue, model, memory — wired into a loop, with
 * request pulses travelling the edges. It is the same cycle described in the
 * OmniChat AI project, running in 3D.
 *
 * Original work: geometry, motion and colour are generated here from the
 * site's own theme tokens.
 */

const NODES = [
  { label: 'Client', angle: 0, y: 0.55, size: 0.2 },
  { label: 'API', angle: 1.2566, y: -0.2, size: 0.22 },
  { label: 'Queue', angle: 2.5133, y: 0.35, size: 0.2 },
  { label: 'LLM', angle: 3.7699, y: -0.45, size: 0.34 },
  { label: 'Memory', angle: 5.0265, y: 0.15, size: 0.24 },
]

const RADIUS = 1.65
const PULSES_PER_EDGE = 2

export default function AgentGraph3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = createRenderer(mount)
    if (!renderer) return

    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
    camera.position.set(0, 0.35, 5.4)
    camera.lookAt(0, 0, 0)

    const world = new THREE.Group()
    scene.add(world)

    addLights(scene)

    /* ---- Theme-driven colours ---- */
    let brand = cssColor('--brand', '#2584f5')
    let fg = cssColor('--fg', '#0a0a0a')

    /* ---- Nodes ---- */
    const nodeGeo = new THREE.IcosahedronGeometry(1, 2)
    const nodes = NODES.map((spec) => {
      const material = new THREE.MeshStandardMaterial({
        color: brand,
        emissive: brand,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.1,
      })
      const mesh = new THREE.Mesh(nodeGeo, material)
      mesh.position.set(
        Math.cos(spec.angle) * RADIUS,
        spec.y,
        Math.sin(spec.angle) * RADIUS
      )
      mesh.scale.setScalar(spec.size)
      world.add(mesh)

      // A faint shell so each node reads as a node, not just a dot.
      const shellMat = new THREE.MeshBasicMaterial({
        color: brand,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      })
      const shell = new THREE.Mesh(nodeGeo, shellMat)
      shell.position.copy(mesh.position)
      shell.scale.setScalar(spec.size * 1.75)
      world.add(shell)

      return { mesh, shell, material, shellMat, spec }
    })

    /* ---- Edges: the loop each request travels ---- */
    const edgeMat = new THREE.LineBasicMaterial({
      color: fg,
      transparent: true,
      opacity: 0.28,
    })
    const edges = []
    for (let i = 0; i < nodes.length; i++) {
      const from = nodes[i].mesh.position
      const to = nodes[(i + 1) % nodes.length].mesh.position

      // Bow each edge outward so the loop reads as a ring, not a polygon.
      const mid = from.clone().add(to).multiplyScalar(0.5)
      mid.multiplyScalar(1.22)
      mid.y = (from.y + to.y) / 2

      const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone())
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))
      const line = new THREE.Line(geo, edgeMat)
      world.add(line)
      edges.push({ curve, geo })
    }

    /* ---- Pulses travelling the edges ---- */
    const pulseGeo = new THREE.SphereGeometry(0.055, 12, 12)
    const pulseMat = new THREE.MeshBasicMaterial({ color: brand })
    const pulses = []
    edges.forEach((edge, edgeIndex) => {
      for (let p = 0; p < PULSES_PER_EDGE; p++) {
        const mesh = new THREE.Mesh(pulseGeo, pulseMat)
        world.add(mesh)
        pulses.push({
          mesh,
          curve: edge.curve,
          t: (p / PULSES_PER_EDGE + edgeIndex * 0.17) % 1,
          speed: 0.18 + (edgeIndex % 3) * 0.035,
        })
      }
    })

    /* ---- Pointer parallax ---- */
    const pointer = { x: 0, y: 0 }
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

    /* ---- Animate ---- */
    const clock = new THREE.Clock()
    let frame = null

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible) return

      const delta = Math.min(clock.getDelta(), 0.05)
      const time = clock.elapsedTime

      world.rotation.y += delta * 0.22

      pointer.x += (target.x - pointer.x) * 0.05
      pointer.y += (target.y - pointer.y) * 0.05
      world.rotation.x = pointer.y * 0.28
      world.position.x = pointer.x * 0.22

      // Nodes breathe, the model node a little harder than the rest.
      nodes.forEach(({ mesh, shell, material, spec }, i) => {
        const beat = Math.sin(time * 1.5 + i * 1.1)
        const scale = spec.size * (1 + beat * 0.05)
        mesh.scale.setScalar(scale)
        shell.rotation.y += delta * 0.4
        shell.rotation.x += delta * 0.18
        material.emissiveIntensity = 0.3 + beat * 0.14
      })

      pulses.forEach((pulse) => {
        pulse.t = (pulse.t + delta * pulse.speed) % 1
        pulse.curve.getPoint(pulse.t, pulse.mesh.position)
      })

      renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    /* ---- Follow the theme ---- */
    const applyTheme = () => {
      brand = cssColor('--brand', '#2584f5')
      fg = cssColor('--fg', '#0a0a0a')
      nodes.forEach(({ material, shellMat }) => {
        material.color.copy(brand)
        material.emissive.copy(brand)
        shellMat.color.copy(brand)
      })
      pulseMat.color.copy(brand)
      edgeMat.color.copy(fg)
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

      nodeGeo.dispose()
      pulseGeo.dispose()
      pulseMat.dispose()
      edgeMat.dispose()
      edges.forEach(({ geo }) => geo.dispose())
      nodes.forEach(({ material, shellMat }) => {
        material.dispose()
        shellMat.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="graph3d" ref={mountRef} aria-hidden="true">
      <span className="graph3d-caption">Agent runtime · request loop</span>
    </div>
  )
}

