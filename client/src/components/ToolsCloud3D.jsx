import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TECH } from '../data/tech.js'
import { createVisibilityGate, cssColor, svgToTexture } from '../lib/three-utils.js'

/**
 * The tech stack as solid 3D tiles that drop in and pile up.
 *
 * Physics is a small position-based solver written for this scene: gravity,
 * floor and wall bounds, and circle-circle separation run over a few
 * relaxation passes each frame, which keeps a stack of tiles stable without
 * pulling in an engine. The tiles themselves are lit, shadow-casting meshes.
 *
 * Grab one to drag and throw it; run the cursor through the pile to scatter it.
 */

const SUBSTEPS = 3
const RELAX_PASSES = 4
const GRAVITY = -16
const RESTITUTION = 0.28
const AIR_DRAG = 0.995
const FLOOR_FRICTION = 0.82

export default function ToolsCloud3D() {
  const mountRef = useRef(null)
  const iconsRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    const mount = mountRef.current
    const iconHost = iconsRef.current
    if (!mount || !iconHost) return

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.04
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const FOV = 40
    const CAM_Z = 9
    const camera = new THREE.PerspectiveCamera(
      FOV,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 0, CAM_Z)

    /* ---- Lighting ---- */
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture

    const key = new THREE.DirectionalLight(0xffffff, 1.9)
    key.position.set(2.5, 6, 6)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 24
    key.shadow.bias = -0.0015
    key.shadow.radius = 3
    scene.add(key, new THREE.DirectionalLight(0xffffff, 0.35))

    // Tiles cast onto a plane just behind them, for a soft drop shadow.
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.16 })
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), shadowMat)
    backdrop.position.z = -1.4
    backdrop.receiveShadow = true
    scene.add(backdrop)

    /* ---- Bounds, recomputed from the viewport ---- */
    const bounds = { left: 0, right: 0, floor: 0, top: 0, size: 0.9, radius: 0.58 }

    const measure = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      const visibleH = 2 * Math.tan((FOV * Math.PI) / 360) * CAM_Z
      const visibleW = visibleH * (w / h)

      bounds.size = w < 620 ? 0.72 : 0.92
      bounds.radius = bounds.size * 0.63
      bounds.left = -visibleW / 2 + bounds.radius
      bounds.right = visibleW / 2 - bounds.radius
      bounds.floor = -visibleH / 2 + bounds.radius
      bounds.top = visibleH / 2

      key.shadow.camera.left = -visibleW
      key.shadow.camera.right = visibleW
      key.shadow.camera.top = visibleH
      key.shadow.camera.bottom = -visibleH
      key.shadow.camera.updateProjectionMatrix()
    }
    measure()

    /* ---- Tiles ---- */
    const tileGeo = new RoundedBoxGeometry(1, 1, 0.22, 4, 0.14)
    const spread = (i) => -0.72 + 1.44 * ((i + 0.5) / TECH.length)

    const tiles = TECH.map((tech, i) => {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.08,
        envMapIntensity: 0.85,
      })
      const mesh = new THREE.Mesh(tileGeo, material)
      mesh.castShadow = true
      mesh.userData.index = i
      scene.add(mesh)

      return {
        mesh,
        material,
        tech,
        // Dropped from above, staggered, with a little lateral spread.
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: (Math.random() - 0.5) * 0.7,
        spin: (Math.random() - 0.5) * 1.6,
        seed: spread(i),
        delay: i * 0.13,
        released: false,
      }
    })

    const seat = () => {
      tiles.forEach((tile, i) => {
        const span = bounds.right - bounds.left
        tile.x = bounds.left + span * (0.5 + tile.seed * 0.5)
        tile.y = bounds.top + 1.2 + i * 1.15
        tile.vx = (Math.random() - 0.5) * 0.6
        tile.vy = 0
        tile.released = false
        tile.mesh.scale.setScalar(bounds.size)
      })
    }
    seat()

    /* ---- Logo textures ---- */
    let destroyed = false
    const paintTextures = async () => {
      const tileBg = `#${cssColor('--card', '#ffffff').getHexString()}`
      const svgs = iconHost.querySelectorAll('svg')

      for (let i = 0; i < tiles.length; i++) {
        const svg = svgs[i]
        if (!svg) continue
        const texture = await svgToTexture(svg, { background: tileBg })
        if (destroyed) {
          texture.dispose()
          return
        }
        tiles[i].material.map?.dispose()
        tiles[i].material.map = texture
        tiles[i].material.needsUpdate = true
      }
    }
    paintTextures()

    /* ---- Pointer: drag a tile, or shove the pile ---- */
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const hit = new THREE.Vector3()
    const cursor = { x: 0, y: 0, active: false }

    let dragged = null
    let hoverIndex = -1

    const toWorld = (e) => {
      const rect = mount.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      raycaster.ray.intersectPlane(plane, hit)
      return hit
    }

    const onPointerDown = (e) => {
      const p = toWorld(e)
      let best = null
      let bestDist = bounds.radius * 1.15

      for (const tile of tiles) {
        const d = Math.hypot(tile.x - p.x, tile.y - p.y)
        if (d < bestDist) {
          bestDist = d
          best = tile
        }
      }
      if (best) {
        dragged = best
        dragged.grabX = p.x - best.x
        dragged.grabY = p.y - best.y
        mount.setPointerCapture?.(e.pointerId)
        mount.style.cursor = 'grabbing'
      }
    }

    const onPointerUp = (e) => {
      dragged = null
      mount.releasePointerCapture?.(e.pointerId)
      mount.style.cursor = hoverIndex >= 0 ? 'grab' : 'default'
    }

    const onPointerMove = (e) => {
      const p = toWorld(e)
      cursor.x = p.x
      cursor.y = p.y
      cursor.active = true

      if (dragged) return

      const intersect = raycaster.intersectObjects(
        tiles.map((t) => t.mesh),
        false
      )[0]
      const index = intersect ? intersect.object.userData.index : -1
      if (index !== hoverIndex) {
        hoverIndex = index
        setHovered(index >= 0 ? TECH[index].name : null)
        mount.style.cursor = index >= 0 ? 'grab' : 'default'
      }
    }

    const onPointerLeave = () => {
      dragged = null
      cursor.active = false
      hoverIndex = -1
      setHovered(null)
    }

    mount.addEventListener('pointerdown', onPointerDown)
    mount.addEventListener('pointerup', onPointerUp)
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)

    /* ---- Physics ---- */
    const step = (dt, elapsed) => {
      const r = bounds.radius
      const minGap = r * 2

      for (const tile of tiles) {
        if (!tile.released) {
          if (elapsed < tile.delay) continue
          tile.released = true
        }

        if (tile === dragged) {
          const nx = cursor.x - tile.grabX
          const ny = cursor.y - tile.grabY
          // Velocity comes from how fast the cursor is moving the tile,
          // so letting go throws it.
          tile.vx = (nx - tile.x) / dt
          tile.vy = (ny - tile.y) / dt
          tile.x = nx
          tile.y = ny
          tile.spin += (tile.vx * -0.04 - tile.spin) * 0.2
          continue
        }

        tile.vy += GRAVITY * dt
        tile.vx *= AIR_DRAG
        tile.vy *= AIR_DRAG

        // The cursor pushes tiles aside when it is not holding one.
        if (cursor.active && !dragged) {
          const dx = tile.x - cursor.x
          const dy = tile.y - cursor.y
          const d = Math.hypot(dx, dy)
          if (d < r * 2.6 && d > 0.0001) {
            const push = (1 - d / (r * 2.6)) * 26 * dt
            tile.vx += (dx / d) * push
            tile.vy += (dy / d) * push
          }
        }

        tile.x += tile.vx * dt
        tile.y += tile.vy * dt
        tile.angle += tile.spin * dt
        tile.spin *= 0.985
      }

      // Relaxation passes: separate overlaps, then clamp to the bounds.
      for (let pass = 0; pass < RELAX_PASSES; pass++) {
        for (let i = 0; i < tiles.length; i++) {
          const a = tiles[i]
          if (!a.released) continue

          for (let j = i + 1; j < tiles.length; j++) {
            const b = tiles[j]
            if (!b.released) continue

            let dx = b.x - a.x
            let dy = b.y - a.y
            let d = Math.hypot(dx, dy)
            if (d === 0) {
              dx = 0.01
              d = 0.01
            }
            if (d >= minGap) continue

            const overlap = (minGap - d) / d
            const sx = dx * overlap * 0.5
            const sy = dy * overlap * 0.5

            // A held tile does not get pushed; it pushes.
            if (a === dragged) {
              b.x += sx * 2
              b.y += sy * 2
            } else if (b === dragged) {
              a.x -= sx * 2
              a.y -= sy * 2
            } else {
              a.x -= sx
              a.y -= sy
              b.x += sx
              b.y += sy
            }

            const nx = dx / d
            const ny = dy / d
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
            if (rel < 0) {
              const imp = -(1 + RESTITUTION) * rel * 0.5
              if (a !== dragged) {
                a.vx -= imp * nx
                a.vy -= imp * ny
              }
              if (b !== dragged) {
                b.vx += imp * nx
                b.vy += imp * ny
              }
              const shear = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx
              a.spin -= shear * 0.02
              b.spin += shear * 0.02
            }
          }

          if (a === dragged) continue

          if (a.y < bounds.floor) {
            a.y = bounds.floor
            if (a.vy < 0) a.vy = -a.vy * RESTITUTION
            a.vx *= FLOOR_FRICTION
            a.spin *= 0.86
            // Settle flat rather than resting on a corner.
            a.angle += (Math.round(a.angle / (Math.PI / 2)) * (Math.PI / 2) - a.angle) * 0.08
          }
          if (a.x < bounds.left) {
            a.x = bounds.left
            if (a.vx < 0) a.vx = -a.vx * RESTITUTION
          }
          if (a.x > bounds.right) {
            a.x = bounds.right
            if (a.vx > 0) a.vx = -a.vx * RESTITUTION
          }
        }
      }
    }

    /* ---- Loop ---- */
    const clock = new THREE.Clock()
    let frame = null
    let elapsed = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible) return

      // Clamped so the first frame after scrolling into view — where the
      // clock has been idle — cannot blow the solver up with a huge step.
      const delta = Math.min(clock.getDelta(), 1 / 30)
      elapsed += delta

      const dt = delta / SUBSTEPS
      for (let s = 0; s < SUBSTEPS; s++) step(dt, elapsed)

      tiles.forEach((tile, i) => {
        const lifted = i === hoverIndex || tile === dragged
        tile.mesh.position.set(tile.x, tile.y, lifted ? 0.4 : 0)
        tile.mesh.rotation.z = tile.angle
        const wanted = bounds.size * (lifted ? 1.12 : 1)
        tile.mesh.scale.setScalar(
          tile.mesh.scale.x + (wanted - tile.mesh.scale.x) * 0.2
        )
      })

      renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    /* ---- Theme ---- */
    const themeWatcher = new MutationObserver(() => paintTextures())
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

      measure()
      tiles.forEach((tile) => {
        tile.x = Math.min(bounds.right, Math.max(bounds.left, tile.x))
        if (tile.released) tile.y = Math.max(bounds.floor, tile.y)
      })
    }
    const resizeWatcher = new ResizeObserver(onResize)
    resizeWatcher.observe(mount)

    /* ---- Teardown ---- */
    return () => {
      destroyed = true
      if (frame !== null) cancelAnimationFrame(frame)
      gate.dispose()
      themeWatcher.disconnect()
      resizeWatcher.disconnect()
      mount.removeEventListener('pointerdown', onPointerDown)
      mount.removeEventListener('pointerup', onPointerUp)
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)

      tileGeo.dispose()
      backdrop.geometry.dispose()
      shadowMat.dispose()
      tiles.forEach(({ material }) => {
        material.map?.dispose()
        material.dispose()
      })
      envRT.texture.dispose()
      pmrem.dispose()
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
          {hovered || 'Grab a tile and throw it'}
        </span>
      </div>
    </>
  )
}
