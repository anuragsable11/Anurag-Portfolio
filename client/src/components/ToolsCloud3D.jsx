import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TECH } from '../data/tech.js'
import {
  addLights,
  createRenderer,
  createVisibilityGate,
  cssColor,
  svgToTexture,
} from '../lib/three-utils.js'

/**
 * The tech stack as solid 3D tiles orbiting a sphere.
 *
 * Each logo is rasterised from its inline SVG onto a canvas texture and
 * mapped to a rounded box, so the tiles have real depth and catch the light.
 * Drag to spin the cluster; hovering a tile lifts it and names it.
 */

const RADIUS = 2.45
const TILE = 0.66
const DEPTH = 0.16

/** Even point distribution over a sphere (Fibonacci lattice). */
function spherePoints(count, radius) {
  const points = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    points.push(
      new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius)
    )
  }
  return points
}

export default function ToolsCloud3D() {
  const mountRef = useRef(null)
  const iconsRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    const mount = mountRef.current
    const iconHost = iconsRef.current
    if (!mount || !iconHost) return

    const renderer = createRenderer(mount)
    if (!renderer) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 0, 8.2)

    addLights(scene)

    const cluster = new THREE.Group()
    scene.add(cluster)

    /* ---- One rounded tile per technology ---- */
    const tileGeo = new RoundedBoxGeometry(TILE, TILE, DEPTH, 4, 0.1)
    const positions = spherePoints(TECH.length, RADIUS)

    const tiles = TECH.map((tech, i) => {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.48,
        metalness: 0.12,
      })
      const mesh = new THREE.Mesh(tileGeo, material)
      mesh.position.copy(positions[i])
      mesh.lookAt(0, 0, 0)
      mesh.rotateY(Math.PI)
      mesh.userData.index = i
      cluster.add(mesh)
      return { mesh, material, tech, home: positions[i].clone(), lift: 0 }
    })

    /* ---- Paint the logos onto the tiles ---- */
    let disposed = false
    const buildTextures = async () => {
      const tileBg = `#${cssColor('--card', '#ffffff').getHexString()}`
      const svgs = iconHost.querySelectorAll('svg')

      for (let i = 0; i < tiles.length; i++) {
        const svg = svgs[i]
        if (!svg) continue
        const texture = await svgToTexture(svg, { background: tileBg })
        if (disposed) {
          texture.dispose()
          return
        }
        tiles[i].material.map?.dispose()
        tiles[i].material.map = texture
        tiles[i].material.needsUpdate = true
      }
    }
    buildTextures()

    /* ---- Drag to spin ---- */
    const spin = { x: 0.0008, y: 0.0016 }
    let dragging = false
    let last = { x: 0, y: 0 }

    const onPointerDown = (e) => {
      dragging = true
      last = { x: e.clientX, y: e.clientY }
      mount.setPointerCapture?.(e.pointerId)
    }
    const onPointerUp = (e) => {
      dragging = false
      mount.releasePointerCapture?.(e.pointerId)
    }

    /* ---- Hover highlight ---- */
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let hoverIndex = -1

    const onPointerMove = (e) => {
      const rect = mount.getBoundingClientRect()

      if (dragging) {
        spin.y = (e.clientX - last.x) * 0.0006
        spin.x = (e.clientY - last.y) * 0.0006
        last = { x: e.clientX, y: e.clientY }
        return
      }

      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)

      const hit = raycaster.intersectObjects(cluster.children, false)[0]
      const index = hit ? hit.object.userData.index : -1
      if (index !== hoverIndex) {
        hoverIndex = index
        setHovered(index >= 0 ? TECH[index].name : null)
        mount.style.cursor = index >= 0 ? 'pointer' : 'grab'
      }
    }
    const onPointerLeave = () => {
      dragging = false
      hoverIndex = -1
      setHovered(null)
    }

    mount.addEventListener('pointerdown', onPointerDown)
    mount.addEventListener('pointerup', onPointerUp)
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)

    /* ---- Animation ---- */
    const clock = new THREE.Clock()
    let frame = null

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible) return

      clock.getDelta()
      const t = clock.elapsedTime

      cluster.rotation.y += spin.y
      cluster.rotation.x += spin.x

      if (!dragging) {
        // Ease back to a slow idle drift once released.
        spin.y += (0.0016 - spin.y) * 0.02
        spin.x += (0.0008 - spin.x) * 0.02
        cluster.rotation.x *= 0.998
      }

      tiles.forEach((tile, i) => {
        const wanted = i === hoverIndex ? 1 : 0
        tile.lift += (wanted - tile.lift) * 0.12

        // Hovered tiles push outward from the centre and scale up.
        const bob = Math.sin(t * 0.9 + i * 0.7) * 0.04
        const scale = 1 + tile.lift * 0.3 + bob * 0.25
        tile.mesh.scale.setScalar(scale)
        tile.mesh.position
          .copy(tile.home)
          .multiplyScalar(1 + tile.lift * 0.14 + bob * 0.02)
      })

      renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    /* ---- Theme: repaint the tile backgrounds ---- */
    const themeWatcher = new MutationObserver(() => buildTextures())
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
      camera.position.z = w < 640 ? 10.4 : 8.2
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    onResize()
    const resizeWatcher = new ResizeObserver(onResize)
    resizeWatcher.observe(mount)

    /* ---- Teardown ---- */
    return () => {
      disposed = true
      if (frame !== null) cancelAnimationFrame(frame)
      gate.dispose()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      mount.removeEventListener('pointerdown', onPointerDown)
      mount.removeEventListener('pointerup', onPointerUp)
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)

      tileGeo.dispose()
      tiles.forEach(({ material }) => {
        material.map?.dispose()
        material.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <>
      {/* Source SVGs for the textures — rendered, measured, never seen. */}
      <div className="icon-source" ref={iconsRef} aria-hidden="true">
        {TECH.map(({ name, Icon, color }) => (
          <Icon key={name} style={color ? { color } : { color: 'currentColor' }} />
        ))}
      </div>

      <div className="cloud3d" ref={mountRef} aria-hidden="true">
        <span className={`cloud3d-label ${hovered ? 'on' : ''}`}>
          {hovered || 'Drag to spin'}
        </span>
      </div>
    </>
  )
}
