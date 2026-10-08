import * as THREE from 'three'
import { bladeGeometry } from './geometry.js'

/**
 * A flat ring on the floor (XZ plane) whose opacity, carried in the vertex
 * colours' alpha, follows `alphas` across the `radii` from inside out.
 */
function softRing(radii, alphas, segments) {
  const position = []
  const color = []
  const index = []
  const loops = radii.length
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2
    for (let l = 0; l < loops; l++) {
      position.push(Math.cos(a) * radii[l], 0, Math.sin(a) * radii[l])
      color.push(1, 1, 1, alphas[l])
    }
    if (s < segments) {
      for (let l = 0; l < loops - 1; l++) {
        const i = s * loops + l
        index.push(i, i + loops, i + 1, i + 1, i + loops, i + loops + 1)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 4))
  geo.setIndex(index)
  return geo
}

/**
 * Effects attached to the samurai himself — never a scene around him. All
 * of them are small, additive and short-lived, and all of them are off under
 * reduced motion.
 *
 *  - Blade trail: a ribbon between where the blade was, sample by sample,
 *    from just past the guard to the tip: brightest at the tip and newest,
 *    fading over its short life. It is sampled whenever the tip moves fast.
 *  - Glint: a band of light that runs up the blade, tang to tip ('glint').
 *  - Sparks: a brief spray of streaks off the last third of the edge, and a
 *    ring of energy that leaves his feet ('impact').
 *  - Rim: the soft edge light on his armour (the materials' fresnel term),
 *    raised a little while he is hovered and flared at an impact.
 *
 *   scene     the stage's scene
 *   camera    the stage's camera (sparks are drawn facing it)
 *   rig       the samurai's joints: { root, katana, sockets } (a model with
 *             no blade sockets gets only the ring and the rim)
 *   rim       { color, strength }: the materials' shared rim uniforms, or null
 *   rimTint   THREE.Color: the rim's colour
 */
export function createEffects({ scene, camera, rig, rim = null, rimTint = new THREE.Color(0x9fc0ff) }) {
  const { sockets } = rig
  const disposables = []
  const keep = (...items) => {
    disposables.push(...items)
    return items[0]
  }
  // Effect detail by quality tier (see setDetail).
  let detail = { sparks: 28, ring: true, glint: true }
  let enabled = true

  /* ================================================================
     Blade trail
     ================================================================ */
  const TRAIL_N = 28
  const TRAIL_LIFE = 0.16
  const trailGeo = keep(new THREE.BufferGeometry())
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3))
  trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3))
  const trailIndex = []
  for (let i = 0; i < TRAIL_N - 1; i++) trailIndex.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  trailGeo.setIndex(trailIndex)
  const trailMat = keep(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  )
  const trail = new THREE.Mesh(trailGeo, trailMat)
  trail.frustumCulled = false
  trail.visible = false
  scene.add(trail)
  const trailRing = Array.from({ length: TRAIL_N }, () => ({
    base: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    t: -1,
  }))
  let trailHead = 0
  let trailCount = 0
  const trailTip = new THREE.Vector3()
  const trailBase = new THREE.Vector3()
  const trailPrevTip = new THREE.Vector3()
  const trailPush = (t) => {
    const s = trailRing[trailHead]
    s.base.copy(trailBase)
    s.tip.copy(trailTip)
    s.t = t
    trailHead = (trailHead + 1) % TRAIL_N
    trailCount = Math.min(trailCount + 1, TRAIL_N)
  }
  const trailWrite = (t) => {
    while (trailCount > 0 && t - trailRing[(trailHead - trailCount + TRAIL_N) % TRAIL_N].t > TRAIL_LIFE) {
      trailCount--
    }
    if (trailCount < 2) {
      trail.visible = false
      return
    }
    const pos = trailGeo.attributes.position
    const col = trailGeo.attributes.color
    for (let i = 0; i < trailCount; i++) {
      const s = trailRing[(trailHead - trailCount + i + TRAIL_N) % TRAIL_N]
      const k = Math.max(0, 1 - (t - s.t) / TRAIL_LIFE)
      const g = k * k * 0.6
      pos.setXYZ(i * 2, s.base.x, s.base.y, s.base.z)
      pos.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z)
      col.setXYZ(i * 2, g * 0.5, g * 0.56, g * 0.66)
      col.setXYZ(i * 2 + 1, g * 0.86, g * 0.92, g)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    trailGeo.setDrawRange(0, (trailCount - 1) * 6)
    trail.visible = true
  }

  /* ================================================================
     Glint: a band of light running up the blade
     ================================================================ */
  // The band lives in the middle of a strip texture mapped along the
  // blade's length (its UVs run tang → tip in v); sliding the texture
  // moves the band from below the guard to past the point.
  const bandCanvas = document.createElement('canvas')
  bandCanvas.width = 4
  bandCanvas.height = 128
  const bctx = bandCanvas.getContext('2d')
  const band = bctx.createLinearGradient(0, 0, 0, 128)
  band.addColorStop(0, 'rgba(0,0,0,1)')
  band.addColorStop(0.38, 'rgba(0,0,0,1)')
  band.addColorStop(0.47, 'rgba(120,128,140,1)')
  band.addColorStop(0.5, 'rgba(255,255,255,1)')
  band.addColorStop(0.53, 'rgba(120,128,140,1)')
  band.addColorStop(0.62, 'rgba(0,0,0,1)')
  band.addColorStop(1, 'rgba(0,0,0,1)')
  bctx.fillStyle = band
  bctx.fillRect(0, 0, 4, 128)
  const bandTex = keep(new THREE.CanvasTexture(bandCanvas))
  bandTex.colorSpace = THREE.SRGBColorSpace
  bandTex.wrapS = bandTex.wrapT = THREE.ClampToEdgeWrapping
  const glintMat = keep(
    new THREE.MeshBasicMaterial({
      map: bandTex,
      color: new THREE.Color(1, 0.96, 0.88),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // Drawn over the blade's own surface: nudged toward the camera so
      // the two never fight for the same depth.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    })
  )
  const glintGeo = keep(bladeGeometry(1.26))
  const glint = new THREE.Mesh(glintGeo, glintMat)
  glint.position.y = 0.19
  glint.visible = false
  glint.frustumCulled = false
  rig.katana?.add(glint)
  let glintStart = -1
  const GLINT_TIME = 0.42

  /* ================================================================
     Sparks: short streaks thrown off the edge, falling as they fade
     ================================================================ */
  // Each streak is a thin ribbon from its tail to its head, turned to face
  // the camera (GL lines are a single pixel wide, and WebGPU has no wide
  // lines at all). Soft at the sides, bright at the head.
  const SPARKS = 40
  const SPARK_WIDTH = 0.038
  const sparkGeo = keep(new THREE.BufferGeometry())
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 12), 3))
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 16), 4))
  const sparkUV = new Float32Array(SPARKS * 8)
  const sparkIndex = []
  for (let i = 0; i < SPARKS; i++) {
    sparkUV.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8)
    sparkIndex.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3)
  }
  sparkGeo.setAttribute('uv', new THREE.BufferAttribute(sparkUV, 2))
  sparkGeo.setIndex(sparkIndex)
  const edgeCanvas = document.createElement('canvas')
  edgeCanvas.width = 16
  edgeCanvas.height = 1
  const ectx = edgeCanvas.getContext('2d')
  const edge = ectx.createLinearGradient(0, 0, 16, 0)
  edge.addColorStop(0, '#333')
  edge.addColorStop(0.5, '#fff')
  edge.addColorStop(1, '#333')
  ectx.fillStyle = edge
  ectx.fillRect(0, 0, 16, 1)
  const edgeTex = keep(new THREE.CanvasTexture(edgeCanvas))
  const sparkMat = keep(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      alphaMap: edgeTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  )
  const sparkLines = new THREE.Mesh(sparkGeo, sparkMat)
  sparkLines.frustumCulled = false
  sparkLines.visible = false
  scene.add(sparkLines)
  // Head and tail colours: white-hot gold on a dark page (brighter than 1:
  // tone mapping brings it back to a hot white), deeper amber on a light
  // one, where it is laid on normally so it shows.
  const SPARK_HEAD = { dark: [4, 3.4, 2.4], light: [1, 0.55, 0.1] }
  const SPARK_TAIL = { dark: [1.3, 0.6, 0.16], light: [0.82, 0.3, 0.02] }

  /* ---- Flash: a moment of light at the point as the stance lands ---- */
  const flashCanvas = document.createElement('canvas')
  flashCanvas.width = flashCanvas.height = 64
  const fctx = flashCanvas.getContext('2d')
  const flashGrad = fctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  flashGrad.addColorStop(0, 'rgba(255,255,255,1)')
  flashGrad.addColorStop(0.18, 'rgba(255,236,200,0.8)')
  flashGrad.addColorStop(0.5, 'rgba(255,190,110,0.18)')
  flashGrad.addColorStop(1, 'rgba(255,170,80,0)')
  fctx.fillStyle = flashGrad
  fctx.fillRect(0, 0, 64, 64)
  const flashTex = keep(new THREE.CanvasTexture(flashCanvas))
  flashTex.colorSpace = THREE.SRGBColorSpace
  const flashMat = keep(
    new THREE.SpriteMaterial({
      map: flashTex,
      color: new THREE.Color(1.6, 1.45, 1.2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })
  )
  const flash = new THREE.Sprite(flashMat)
  flash.visible = false
  flash.frustumCulled = false
  scene.add(flash)
  let flashStart = -1
  const FLASH_TIME = 0.22
  let page = 'dark'
  const sparks = Array.from({ length: SPARKS }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    age: 1,
    life: 1,
    heat: 1,
  }))
  let sparksAlive = 0

  /* ================================================================
     Energy ring: a thin ring of light leaving his feet
     ================================================================ */
  const ringGeo = keep(softRing([0.7, 0.9, 1], [0, 1, 0], 96))
  const ringMat = keep(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.72, 0.36),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })
  )
  // On the floor itself, not on him: his root drops a little in a crouch.
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.015
  ring.visible = false
  ring.renderOrder = 1
  scene.add(ring)
  let ringStart = -1
  const RING_TIME = 0.7

  /* ---- Rim light ---- */
  let rimBase = 0
  let rimPulse = 0

  /* ---- Scratch ---- */
  const tipW = new THREE.Vector3()
  const baseW = new THREE.Vector3()
  const along = new THREE.Vector3()
  const out = new THREE.Vector3()
  const katanaQ = new THREE.Quaternion()
  const camPos = new THREE.Vector3()
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  const tail = new THREE.Vector3()
  let now = 0

  const emitSparks = () => {
    if (!sockets) return
    sockets.katanaTip.updateWorldMatrix(true, false)
    sockets.katanaBase.updateWorldMatrix(false, false)
    tipW.setFromMatrixPosition(sockets.katanaTip.matrixWorld)
    baseW.setFromMatrixPosition(sockets.katanaBase.matrixWorld)
    along.subVectors(tipW, baseW)
    rig.katana.getWorldQuaternion(katanaQ)
    // The edge faces the katana's +X.
    out.set(1, 0, 0).applyQuaternion(katanaQ)
    // Thrown across the picture, not along the line of sight, so they read
    // whichever way the blade points: mostly up and outward from the edge.
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const n = Math.min(SPARKS, detail.sparks)
    for (let i = 0; i < n; i++) {
      const s = sparks[i]
      s.p.copy(baseW).addScaledVector(along, 0.84 + Math.random() * 0.16)
      const a = Math.PI * (0.06 + Math.random() * 0.88) // over the upper half
      const speed = 2 + Math.random() * 1.8
      s.v
        .copy(camRight)
        .multiplyScalar(Math.cos(a) * speed)
        .addScaledVector(camUp, Math.sin(a) * speed * 0.9)
        .addScaledVector(out, 0.5 + Math.random() * 0.6)
      s.age = 0
      s.life = 0.36 + Math.random() * 0.34
      s.heat = 0.7 + Math.random() * 0.3
    }
    sparksAlive = n
    sparkLines.visible = true
    flash.position.copy(tipW)
    flashStart = now
    flash.visible = true
  }

  const updateSparks = (dt) => {
    if (!sparksAlive) return
    const pos = sparkGeo.attributes.position
    const col = sparkGeo.attributes.color
    const head = SPARK_HEAD[page]
    const end = SPARK_TAIL[page]
    camera.getWorldPosition(camPos)
    let alive = 0
    for (let i = 0; i < sparksAlive; i++) {
      const s = sparks[i]
      s.age += dt
      const k = Math.max(0, 1 - s.age / s.life)
      if (k > 0) alive++
      s.v.y -= 6 * dt
      s.v.multiplyScalar(Math.exp(-2.2 * dt))
      s.p.addScaledVector(s.v, dt)
      // A streak from a tail a few hundredths of a second behind to the
      // head, widened sideways across the line of sight.
      tail.copy(s.p).addScaledVector(s.v, -0.05)
      dir.subVectors(s.p, tail)
      toCam.subVectors(camPos, s.p)
      side.crossVectors(dir, toCam)
      const len = side.length()
      if (len > 1e-6) side.multiplyScalar((SPARK_WIDTH * (0.6 + 0.4 * k)) / 2 / len)
      pos.setXYZ(i * 4, tail.x - side.x, tail.y - side.y, tail.z - side.z)
      pos.setXYZ(i * 4 + 1, tail.x + side.x, tail.y + side.y, tail.z + side.z)
      pos.setXYZ(i * 4 + 2, s.p.x - side.x, s.p.y - side.y, s.p.z - side.z)
      pos.setXYZ(i * 4 + 3, s.p.x + side.x, s.p.y + side.y, s.p.z + side.z)
      const a = k ** 1.4 * s.heat
      for (const v of [0, 1]) col.setXYZW(i * 4 + v, end[0], end[1], end[2], a * 0.35)
      for (const v of [2, 3]) col.setXYZW(i * 4 + v, head[0], head[1], head[2], a)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    sparkGeo.setDrawRange(0, sparksAlive * 6)
    if (!alive) {
      sparksAlive = 0
      sparkLines.visible = false
    }
  }

  return {
    /** Additive pieces the AO normal pass must not treat as solid. */
    transient: [trail, glint, sparkLines, ring, flash],
    /** Dev: what the effects are doing right now. */
    get debug() {
      return {
        ring: { visible: ring.visible, opacity: +ringMat.opacity.toFixed(3), scale: +ring.scale.x.toFixed(2) },
        sparks: { visible: sparkLines.visible, alive: sparksAlive },
        flash: { visible: flash.visible, opacity: +flashMat.opacity.toFixed(3) },
        glint: { visible: glint.visible, opacity: +glintMat.opacity.toFixed(3) },
        rim: rim ? rim.color.value.toArray().map((v) => +v.toFixed(3)) : null,
        detail,
        enabled,
      }
    },
    get trailState() {
      return { samples: trailCount, visible: trail.visible }
    },
    /** True while anything is still animating (keeps the loop awake). */
    get busy() {
      return trail.visible || glint.visible || sparkLines.visible || flash.visible || ring.visible || rimPulse > 0.002
    },
    /** A cue from the animation: 'glint' or 'impact'. */
    cue(name) {
      if (!enabled) return
      if (name === 'glint' && detail.glint && rig.katana) {
        glintStart = now
        glint.visible = true
      } else if (name === 'impact') {
        if (detail.sparks > 0) emitSparks()
        if (detail.ring) {
          ringStart = now
          ring.visible = true
        }
        rimPulse = 1
      }
    },
    /**
     * Light page or dark: light is added on a dark page, but a light page
     * would swallow it, so there the sparks and ring are laid on normally,
     * in deeper colours.
     */
    setPage(next) {
      page = next === 'light' ? 'light' : 'dark'
      const blending = page === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending
      sparkMat.blending = ringMat.blending = blending
      ringMat.color.set(page === 'light' ? 0xc08a2e : 0xffb85c)
    },
    /** Rim strength at rest (from the theme) — hover and impacts add to it. */
    setRimBase(v) {
      rimBase = v
    },
    /** Per-tier effect detail: spark count, the ring, the glint. */
    setDetail(next) {
      detail = { ...detail, ...next }
    },
    /** Reduced motion turns every effect off (the rim stays, unpulsed). */
    setEnabled(on) {
      enabled = on
      if (!on) {
        glint.visible = ring.visible = sparkLines.visible = flash.visible = false
        sparksAlive = 0
        rimPulse = 0
      }
    },
    /**
     * One frame, after the pose is set. `still` is 0 under reduced motion;
     * `hover` is the eased hover level (0..1).
     */
    update(dt, t, { still, hover = 0 }) {
      now = t
      if (sockets) {
        sockets.katanaTip.updateWorldMatrix(true, false)
        sockets.katanaBase.updateWorldMatrix(false, false)
        trailTip.setFromMatrixPosition(sockets.katanaTip.matrixWorld)
        trailBase.setFromMatrixPosition(sockets.katanaBase.matrixWorld)
        const tipSpeed = dt > 0 ? trailTip.distanceTo(trailPrevTip) / dt : 0
        trailPrevTip.copy(trailTip)
        if (tipSpeed > 4.5 && still && enabled) trailPush(t)
        trailWrite(t)
      }

      if (glint.visible) {
        const k = (t - glintStart) / GLINT_TIME
        if (k >= 1) glint.visible = false
        else {
          // The band climbs from below the guard to past the point.
          bandTex.offset.y = 0.62 - k * 1.3
          glintMat.opacity = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.9
        }
      }

      updateSparks(dt)

      if (flash.visible) {
        const k = (t - flashStart) / FLASH_TIME
        if (k >= 1) flash.visible = false
        else {
          flash.scale.setScalar(0.18 + 0.42 * Math.sqrt(k))
          flashMat.opacity = (1 - k) ** 2
        }
      }

      if (ring.visible) {
        const k = (t - ringStart) / RING_TIME
        if (k >= 1) ring.visible = false
        else {
          const ease = 1 - (1 - k) ** 3
          ring.scale.setScalar(0.5 + ease * 1.35)
          ringMat.opacity = (1 - k) ** 1.6 * (page === 'light' ? 0.42 : 0.55)
        }
      }

      rimPulse *= Math.exp(-5 * dt)
      if (rim) {
        const strength = rimBase + 0.14 * hover + 0.55 * rimPulse
        rim.color.value.copy(rimTint).multiplyScalar(strength)
      }
    },
    dispose() {
      scene.remove(trail, sparkLines, flash)
      rig.katana?.remove(glint)
      scene.remove(ring)
      disposables.forEach((d) => d.dispose())
    },
  }
}
