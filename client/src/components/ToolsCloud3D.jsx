import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TECH } from '../data/tech.js'
import { loadBakedEnvironment, renderStudioPMREM } from '../lib/studio-env.js'
import { extrudeSvgIcon } from '../lib/svg-extrude.js'
import { createVisibilityGate, cssColor, svgToTexture } from '../lib/three-utils.js'
import envUrl from '../assets/samurai-env.png'

/**
 * The tech stack as solid 3D tiles that drop in and pile up.
 *
 * Physics is a small position-based solver written for this scene: gravity,
 * floor and wall bounds, and circle-circle separation run over a few
 * relaxation passes each frame, which keeps a stack of tiles stable without
 * pulling in an engine.
 *
 * Each tile is a clear-coated block with its logo extruded from the icon's
 * SVG outline as real, bevelled geometry, so it stays sharp at any pixel
 * density and catches highlights from the studio reflection map (the same
 * baked softbox environment as the samurai). On top of the 2D solver, every
 * tile has a sprung 3D tilt: knocks, landings and throws rock it, and the
 * hovered tile leans toward the cursor. The tiles stand on an invisible studio
 * floor that shows only their shadows, and the camera drifts with the pointer
 * so the depth of the pile reads.
 *
 * Grab one to drag and throw it; run the cursor through the pile to scatter it.
 */

const SUBSTEPS = 3
const RELAX_PASSES = 4
const GRAVITY = -16
const RESTITUTION = 0.28
const AIR_DRAG = 0.995
const FLOOR_FRICTION = 0.82
const MAX_THROW = 24

// The 3D tilt: a damped spring pulls every tile back to face the camera.
const TILT_SPRING = 70
const TILT_DAMPING = 7
const TILT_MAX = 0.7
const HOVER_TILT = 0.42

// The camera looks slightly down, so the floor the tiles stand on shows as
// a strip across the bottom of the view.
const FOV = 40
const CAM_Y = 1.1
const CAM_Z = 9
const LOOK_Y = -0.5
const FLOOR_NDC = -0.7

// Tile body and the raised logo on its face, in tile units.
const TILE_DEPTH = 0.3
const LOGO_SIZE = 0.56
const LOGO_DEPTH = 0.06
const LOGO_BEVEL = 0.012

// Start fetching the reflection map as soon as this chunk loads.
const bakedEnv = loadBakedEnvironment(envUrl).catch(() => null)

const clampTilt = (v) => Math.max(-TILT_MAX, Math.min(TILT_MAX, v))

export default function ToolsCloud3D() {
  const mountRef = useRef(null)
  const iconsRef = useRef(null)
  const [hovered, setHovered] = useState(-1)

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
    // Neutral, not ACES: it keeps the brand colours of the logos true
    // instead of washing saturated reds and blues toward pastel.
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    // PCFSoftShadowMap was removed in r186; `shadow.radius` softens PCF.
    renderer.shadowMap.type = THREE.PCFShadowMap
    mount.appendChild(renderer.domElement)

    const finePointer = window.matchMedia('(pointer: fine)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      FOV,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, CAM_Y, CAM_Z)
    camera.lookAt(0, LOOK_Y, 0)
    // The camera at rest, without the pointer drift, for fitting the bounds.
    const rig = camera.clone()

    /* ---- Lighting: studio reflections, warm key, cool fill, back rim ---- */
    // The reflection map arrives asynchronously (see start() below).
    let envFallback = null
    let envTexture = null

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd6dce6, 0.7)

    const key = new THREE.DirectionalLight(0xfff4e8, 2.1)
    key.position.set(3, 6, 7)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.bias = -0.0008
    key.shadow.normalBias = 0.02
    key.shadow.radius = 4

    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.55)
    fill.position.set(-6, 1.5, 5)

    // Grazes the top bevels from behind, which is what separates a tile's
    // edge from the page.
    const rim = new THREE.DirectionalLight(0xffffff, 1.3)
    rim.position.set(-1, 5, -6)

    scene.add(hemi, key, fill, rim)

    // An invisible studio corner, a floor and a wall behind it, that only
    // shows the shadows falling on it.
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.18 })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 12), shadowMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.z = 4.6
    floor.receiveShadow = true
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), shadowMat)
    wall.position.z = -1.4
    wall.receiveShadow = true
    scene.add(floor, wall)

    // A soft contact shadow under each tile, which fades as the tile lifts.
    const blobCanvas = document.createElement('canvas')
    blobCanvas.width = blobCanvas.height = 128
    const blobCtx = blobCanvas.getContext('2d')
    const blobGrad = blobCtx.createRadialGradient(64, 64, 0, 64, 64, 64)
    blobGrad.addColorStop(0, 'rgba(0,0,0,1)')
    blobGrad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
    blobGrad.addColorStop(1, 'rgba(0,0,0,0)')
    blobCtx.fillStyle = blobGrad
    blobCtx.fillRect(0, 0, 128, 128)
    const blobTex = new THREE.CanvasTexture(blobCanvas)
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    let blobStrength = 0.3

    /* ---- Pointer ray, shared by the bounds fit and the pointer ---- */
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const hit = new THREE.Vector3()

    /** Where a point on the screen lands on the tiles' plane, seen by `cam`. */
    const onPlane = (x, y, cam) => {
      raycaster.setFromCamera(ndc.set(x, y), cam)
      return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : new THREE.Vector3()
    }

    /* ---- Bounds, recomputed from the viewport ---- */
    const bounds = { left: 0, right: 0, floor: 0, ground: 0, top: 0, size: 0.9, radius: 0.58 }

    const measure = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      rig.aspect = w / h
      rig.updateProjectionMatrix()
      rig.updateMatrixWorld()

      bounds.size = w < 620 ? 0.74 : 0.94
      bounds.radius = bounds.size * 0.63

      // The view is a slight trapezoid on the tiles' plane; the walls take
      // the narrower end. A little extra inset keeps the camera drift from
      // cropping an edge tile.
      const ground = onPlane(-1, FLOOR_NDC, rig)
      const top = onPlane(-1, 1, rig)
      const halfW = Math.min(-ground.x, -top.x)
      bounds.left = -halfW + bounds.radius + 0.12
      bounds.right = halfW - bounds.radius - 0.12
      bounds.ground = ground.y
      // Upright tiles stand on the floor line; the collision circle is a
      // little larger than the tile, so this is not `radius`.
      bounds.floor = ground.y + bounds.size * 0.54
      bounds.top = top.y

      floor.position.y = bounds.ground
      wall.position.y = bounds.ground + 20

      // Fitted to the view, not doubled, to keep shadow texels dense.
      key.shadow.camera.left = -halfW - 2
      key.shadow.camera.right = halfW + 2
      key.shadow.camera.top = 5
      key.shadow.camera.bottom = -5
      key.shadow.camera.updateProjectionMatrix()
    }
    measure()

    /* ---- Tiles ---- */
    const bodyGeo = new RoundedBoxGeometry(1, 1, TILE_DEPTH, 6, 0.12)
    // One shared body: glazed ceramic in light mode, piano black in dark.
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    })

    const svgs = iconHost.querySelectorAll('svg')
    const logoGeos = []
    const decals = []
    const spread = (i) => -0.72 + 1.44 * ((i + 0.5) / TECH.length)

    const tiles = TECH.map((tech, i) => {
      const group = new THREE.Group()
      const body = new THREE.Mesh(bodyGeo, bodyMat)
      body.castShadow = true
      body.receiveShadow = true
      body.userData.index = i
      group.add(body)

      // Same feature set as the body, so both share one shader program.
      const logoMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        emissive: 0x000000,
      })

      let geometry = null
      try {
        geometry = svgs[i]
          ? extrudeSvgIcon(svgs[i], { size: LOGO_SIZE, depth: LOGO_DEPTH, bevel: LOGO_BEVEL })
          : null
      } catch {
        geometry = null
      }

      if (geometry) {
        logoGeos.push(geometry)
        const logo = new THREE.Mesh(geometry, logoMat)
        logo.position.z = TILE_DEPTH / 2 - 0.004
        logo.castShadow = true
        group.add(logo)
      } else if (svgs[i]) {
        // An outline the extruder cannot use still gets its logo, printed flat.
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(LOGO_SIZE, LOGO_SIZE),
          new THREE.MeshBasicMaterial({ transparent: true })
        )
        decal.position.z = TILE_DEPTH / 2 + 0.002
        group.add(decal)
        decals.push({ mesh: decal, svg: svgs[i] })
      }

      scene.add(group)

      const blob = new THREE.Mesh(
        blobGeo,
        new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
      )
      blob.renderOrder = -1
      scene.add(blob)

      return {
        group,
        body,
        blob,
        logoMat,
        tech,
        // Dropped from above, staggered, with a little lateral spread.
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: (Math.random() - 0.5) * 0.7,
        spin: (Math.random() - 0.5) * 1.6,
        // 3D tilt about the screen axes, and its angular velocity.
        tiltX: 0,
        tiltY: 0,
        tiltVX: 0,
        tiltVY: 0,
        // Which way a hard landing rocks the tile.
        rock: Math.random() < 0.5 ? -1 : 1,
        lift: 0,
        glow: 0,
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
        // They fall tumbling and are sprung square as they land.
        tile.tiltX = (Math.random() - 0.5) * 1.2
        tile.tiltY = (Math.random() - 0.5) * 1.2
        tile.tiltVX = (Math.random() - 0.5) * 4
        tile.tiltVY = (Math.random() - 0.5) * 4
        tile.released = false
        tile.group.scale.setScalar(bounds.size)
        tile.group.position.set(tile.x, tile.y, 0)
      })
    }
    seat()

    /* ---- Theme ---- */
    let destroyed = false

    const paintDecals = async () => {
      for (const { mesh, svg } of decals) {
        const texture = await svgToTexture(svg, {
          size: 512,
          background: 'rgba(0,0,0,0)',
          padding: 0,
        })
        if (destroyed) {
          texture.dispose()
          return
        }
        mesh.material.map?.dispose()
        mesh.material.map = texture
        mesh.material.needsUpdate = true
      }
    }

    const applyTheme = () => {
      const dark = document.documentElement.dataset.theme === 'dark'
      bodyMat.color.copy(cssColor('--card', '#ffffff'))
      // Clear coat over near-black needs less roughness under it to read as
      // lacquer; over white, a little more keeps it from looking like plastic.
      bodyMat.roughness = dark ? 0.22 : 0.32
      scene.environmentIntensity = dark ? 1.1 : 0.75
      hemi.intensity = dark ? 0.35 : 0.7
      shadowMat.opacity = dark ? 0.42 : 0.16
      blobStrength = dark ? 0.8 : 0.34

      const fg = cssColor('--fg', dark ? '#fafafa' : '#0a0a0a')
      tiles.forEach(({ logoMat, tech }) => {
        logoMat.color.copy(tech.color ? new THREE.Color(tech.color) : fg)
        logoMat.emissive.copy(logoMat.color)
      })
      if (decals.length) paintDecals()
    }
    applyTheme()

    const themeWatcher = new MutationObserver(applyTheme)
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    /* ---- Pointer: drag a tile, or shove the pile ---- */
    const cursor = { x: 0, y: 0, active: false }
    // Where the pointer sits in the canvas, -1..1, for the camera drift.
    const view = { x: 0, y: 0 }
    const bodies = tiles.map((t) => t.body)

    let dragged = null
    let hoverIndex = -1

    const toWorld = (e) => {
      const rect = mount.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      view.x = ndc.x
      view.y = ndc.y
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
        dragged.vx = 0
        dragged.vy = 0
        cursor.x = p.x
        cursor.y = p.y
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

      const intersect = raycaster.intersectObjects(bodies, false)[0]
      const index = intersect ? intersect.object.userData.index : -1
      if (index !== hoverIndex) {
        hoverIndex = index
        setHovered(index)
        mount.style.cursor = index >= 0 ? 'grab' : 'default'
      }
    }

    const onPointerLeave = () => {
      dragged = null
      cursor.active = false
      hoverIndex = -1
      view.x = 0
      view.y = 0
      setHovered(-1)
    }

    mount.addEventListener('pointerdown', onPointerDown)
    mount.addEventListener('pointerup', onPointerUp)
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)

    /* ---- Physics ---- */
    const step = (dt, elapsed) => {
      const r = bounds.radius
      const minGap = r * 2
      const tiltDamp = Math.exp(-TILT_DAMPING * dt)

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i]
        if (!tile.released) {
          if (elapsed < tile.delay) continue
          tile.released = true
        }

        // Tilt target: lean with the throw while held, lean toward the
        // cursor while hovered, otherwise face the camera.
        let aimX = 0
        let aimY = 0
        if (tile === dragged) {
          aimY = clampTilt(tile.vx * 0.045)
          aimX = clampTilt(-tile.vy * 0.045)
        } else if (i === hoverIndex && cursor.active && !dragged) {
          aimY = clampTilt(((cursor.x - tile.x) / r) * HOVER_TILT)
          aimX = clampTilt((-(cursor.y - tile.y) / r) * HOVER_TILT)
        }
        tile.tiltVX = (tile.tiltVX + (aimX - tile.tiltX) * TILT_SPRING * dt) * tiltDamp
        tile.tiltVY = (tile.tiltVY + (aimY - tile.tiltY) * TILT_SPRING * dt) * tiltDamp
        tile.tiltX += tile.tiltVX * dt
        tile.tiltY += tile.tiltVY * dt

        if (tile === dragged) {
          // Pinned to the cursor. Its velocity is measured once per frame in
          // tick(), so letting go throws it.
          tile.x = cursor.x - tile.grabX
          tile.y = cursor.y - tile.grabY
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

        // Once it slows down, a tile rolls itself upright, so it never rests
        // on a corner and its logo always reads the right way up.
        if (Math.abs(tile.vx) + Math.abs(tile.vy) < 1.5) {
          const upright = Math.round(tile.angle / (Math.PI * 2)) * Math.PI * 2
          tile.angle += (upright - tile.angle) * 0.02
        }
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

              // A real knock (not resting contact) rocks both tiles in 3D.
              if (imp > 0.6) {
                const kick = Math.min(imp, 8) * 0.22
                a.tiltVY -= nx * kick
                a.tiltVX += ny * kick
                b.tiltVY += nx * kick
                b.tiltVX -= ny * kick
              }
            }
          }

          if (a === dragged) continue

          if (a.y < bounds.floor) {
            a.y = bounds.floor
            if (a.vy < 0) {
              // Hard landings rock the tile; resting contact does not.
              if (a.vy < -2.5) a.tiltVX += a.vy * 0.2 * a.rock
              a.vy = -a.vy * RESTITUTION
            }
            a.vx *= FLOOR_FRICTION
            a.spin *= 0.86
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
    const timer = new THREE.Timer()
    let frame = null
    let elapsed = 0
    let started = false

    const tick = (now) => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible || !started) return

      // Clamped so the first frame after scrolling into view — where the
      // timer has been idle — cannot blow the solver up with a huge step.
      timer.update(now)
      const delta = Math.min(timer.getDelta(), 1 / 30)
      elapsed += delta

      if (dragged && delta > 0) {
        const nx = cursor.x - dragged.grabX
        const ny = cursor.y - dragged.grabY
        const vx = Math.max(-MAX_THROW, Math.min(MAX_THROW, (nx - dragged.x) / delta))
        const vy = Math.max(-MAX_THROW, Math.min(MAX_THROW, (ny - dragged.y) / delta))
        dragged.vx += (vx - dragged.vx) * 0.5
        dragged.vy += (vy - dragged.vy) * 0.5
      }

      const dt = delta / SUBSTEPS
      for (let s = 0; s < SUBSTEPS; s++) step(dt, elapsed)

      tiles.forEach((tile, i) => {
        const lifted = i === hoverIndex || tile === dragged
        tile.lift += ((lifted ? 0.6 : 0) - tile.lift) * 0.16
        tile.glow += ((lifted ? 0.22 : 0) - tile.glow) * 0.14
        tile.logoMat.emissiveIntensity = tile.glow

        tile.group.position.set(tile.x, tile.y, tile.lift)
        tile.group.rotation.set(tile.tiltX, tile.tiltY, tile.angle)
        const wanted = bounds.size * (lifted ? 1.1 : 1)
        tile.group.scale.setScalar(
          tile.group.scale.x + (wanted - tile.group.scale.x) * 0.2
        )

        // The contact shadow spreads and fades with height off the floor.
        const height = Math.max(0, tile.y - bounds.floor) + tile.lift * 0.5
        const near = Math.max(0, 1 - height / 2.4)
        tile.blob.visible = tile.released && near > 0
        tile.blob.position.set(tile.x, bounds.ground + 0.004, tile.lift)
        tile.blob.scale.set(bounds.size * (1.3 + height * 0.3), 1, bounds.size * (0.62 + height * 0.2))
        tile.blob.material.opacity = blobStrength * near * near
      })

      // Camera drift toward the pointer, so the thickness of the tiles and
      // the relief of the logos show.
      if (finePointer) {
        camera.position.x += (view.x * 0.7 - camera.position.x) * 0.05
        camera.position.y += (CAM_Y + view.y * 0.45 - camera.position.y) * 0.05
        camera.lookAt(0, LOOK_Y, 0)
      }

      renderer.render(scene, camera)
    }

    const gate = createVisibilityGate(mount, () => {
      if (frame === null) tick()
    })
    tick()

    // Compile every shader off the main thread before the first frame, then
    // fade the canvas in and let the tiles drop.
    const start = async () => {
      envTexture = await bakedEnv
      if (destroyed) return
      if (!envTexture) {
        envFallback = renderStudioPMREM(renderer)
        envTexture = envFallback.texture
      }
      scene.environment = envTexture
      try {
        await renderer.compileAsync(scene, camera)
      } catch {
        // Fall back to compiling on first render.
      }
      if (destroyed) return
      timer.update()
      started = true
      mount.classList.add('is-ready')
    }
    start()

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
      mount.classList.remove('is-ready')

      bodyGeo.dispose()
      bodyMat.dispose()
      logoGeos.forEach((g) => g.dispose())
      tiles.forEach(({ logoMat }) => logoMat.dispose())
      decals.forEach(({ mesh }) => {
        mesh.geometry.dispose()
        mesh.material.map?.dispose()
        mesh.material.dispose()
      })
      floor.geometry.dispose()
      wall.geometry.dispose()
      blobGeo.dispose()
      blobTex.dispose()
      tiles.forEach(({ blob }) => blob.material.dispose())
      shadowMat.dispose()
      timer.dispose()
      envTexture?.dispose()
      envFallback?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  const tech = hovered >= 0 ? TECH[hovered] : null

  return (
    <>
      {/* Source SVGs for the logo geometry — rendered, read, never seen. */}
      <div className="icon-source" ref={iconsRef} aria-hidden="true">
        {TECH.map(({ name, Icon, color }) => (
          <Icon key={name} style={color ? { color } : { color: 'currentColor' }} />
        ))}
      </div>

      <div className="cloud3d" ref={mountRef} aria-hidden="true">
        <span className={`cloud3d-label ${tech ? 'on' : ''}`}>
          {tech && (
            <i
              className="cloud3d-dot"
              style={{ background: tech.color || 'var(--fg)' }}
            />
          )}
          {tech ? tech.name : 'Grab a tile and throw it'}
        </span>
      </div>
    </>
  )
}
