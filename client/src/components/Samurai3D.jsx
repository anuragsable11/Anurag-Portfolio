import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createVisibilityGate, cssColor } from '../lib/three-utils.js'

/**
 * An original low-poly samurai mascot, modelled from primitives.
 *
 * Stylised-heroic rather than chibi-cute: the head-and-helmet unit is about
 * 57% of total height over a wide, planted stance. Surfaces are flat-shaded
 * for the faceted look, but materials are separated properly — glossy red
 * lacquer, dark metal, polished gold, matte cloth, mirror steel.
 *
 * Layout, bottom to top (world units, floor at y = 0):
 *   0.04  sandals        1.15  hips / waist (HIP_Y)
 *   0.67  knees          1.73  shoulders
 *   2.30  eye line       2.98  helmet crown
 *   3.88  crest tips
 *
 * The lowest shikoro ring sits at y 2.04 with radius 0.88, clearing the sode
 * (top y 1.81, reaching x 1.01) — keep that gap if you retune either.
 *
 * The shikoro is a rear arc, not a full ring, so the face stays open and lit.
 * Drag to orbit a full 360°. Colours come from the --samurai-* CSS tokens.
 */

const HIP_Y = 1.15
const HEAD_Y = 2.2

// Shikoro covers the back and sides only, leaving ~100° open at the front.
const SHIKORO_START = Math.PI * 0.28
const SHIKORO_SWEEP = Math.PI * 1.44

export default function Samurai3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

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
    // Held below 1: ACES desaturates saturated reds as they approach clipping,
    // which was turning the lacquer coral. Darker exposure keeps it red.
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      31,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.set(1.4, 2.7, 9.0)

    /* ================================================================
       Cinematic three-point lighting

       Key from front-right, a strong cool rim from behind to carve the
       silhouette off the dark stage, and a dim fill so shadows stay deep.
       ================================================================ */
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture
    scene.environmentIntensity = 0.45

    const key = new THREE.DirectionalLight(0xfff4e8, 2.6)
    key.position.set(3.6, 6.5, 5.2)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -4
    key.shadow.camera.right = 4
    key.shadow.camera.top = 6
    key.shadow.camera.bottom = -1.5
    key.shadow.bias = -0.0011
    key.shadow.normalBias = 0.022
    key.shadow.radius = 4

    // Cool rim, hard behind and slightly above — the silhouette separator.
    const rimL = new THREE.DirectionalLight(0xa8c8ff, 2.4)
    rimL.position.set(-4.5, 3.5, -5)
    const rimR = new THREE.DirectionalLight(0xbcd4ff, 1.6)
    rimR.position.set(4.5, 2.5, -4.5)

    const fill = new THREE.DirectionalLight(0xdfe7f5, 0.32)
    fill.position.set(-3.5, 1.2, 4)

    scene.add(key, rimL, rimR, fill)

    /* ---- Controls ---- */
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2.0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = 0.85
    controls.minPolarAngle = 0.55
    controls.maxPolarAngle = Math.PI / 2 + 0.14
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.7

    const finePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
    controls.enabled = finePointer

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

    /* ================================================================
       Materials — each class of surface reads differently
       ================================================================ */
    const geos = new Set()
    const track = (g) => {
      geos.add(g)
      return g
    }

    const flat = (token, fallback, extra = {}) =>
      new THREE.MeshStandardMaterial({
        color: cssColor(token, fallback),
        flatShading: true,
        ...extra,
      })

    const mats = {
      // Lacquer: glossy, barely metallic, so it highlights sharply
      red: flat('--samurai-accent', '#c0392b', { roughness: 0.3, metalness: 0.08 }),
      redDark: flat('--samurai-accent-dark', '#8e2a1e', { roughness: 0.36, metalness: 0.1 }),
      // Dark metal: properly metallic
      navy: flat('--samurai-armor', '#39414f', { roughness: 0.34, metalness: 0.82 }),
      navyDark: flat('--samurai-armor-dark', '#22272f', { roughness: 0.3, metalness: 0.88 }),
      // Polished gold
      gold: flat('--samurai-gold', '#e0a63a', { roughness: 0.18, metalness: 0.96 }),
      // Lacquered bowl, warm off-white
      bowl: flat('--samurai-bowl', '#e8e1d4', { roughness: 0.28, metalness: 0.3 }),
      // Mirror steel
      steel: flat('--samurai-steel', '#e9edf4', { roughness: 0.05, metalness: 1.0 }),
      // Matte cloth / leather
      cloth: flat('--samurai-cloth', '#a8322a', { roughness: 0.92, metalness: 0.0 }),
      leather: flat('--samurai-leather', '#4a3b33', { roughness: 0.85, metalness: 0.04 }),
      face: flat('--samurai-face', '#2f3642', { roughness: 0.42, metalness: 0.6 }),
      eye: flat('--samurai-eye', '#ffb347', {
        roughness: 0.3,
        metalness: 0.1,
        emissive: cssColor('--samurai-eye', '#ffb347'),
        emissiveIntensity: 1.4,
      }),
    }
    const allMats = Object.values(mats)

    const samurai = new THREE.Group()
    scene.add(samurai)

    const mesh = (geo, material) => {
      const m = new THREE.Mesh(track(geo), material)
      m.castShadow = true
      m.receiveShadow = true
      return m
    }

    const STUD = track(new THREE.CylinderGeometry(0.032, 0.032, 0.028, 6))
    const LACE = track(new THREE.BoxGeometry(0.028, 0.045, 0.028))

    const studRow = (parent, count, spacing, y, z, scale = 1) => {
      for (let i = 0; i < count; i++) {
        const stud = new THREE.Mesh(STUD, mats.gold)
        stud.castShadow = true
        stud.position.set((i - (count - 1) / 2) * spacing, y, z)
        stud.rotation.x = Math.PI / 2
        stud.scale.setScalar(scale)
        parent.add(stud)
      }
    }

    /* ================================================================
       Legs — wider, planted stance
       ================================================================ */
    const legs = [-1, 1].map((side) => {
      const hip = new THREE.Group()
      hip.position.set(side * 0.36, HIP_Y, 0)
      samurai.add(hip)

      const thigh = mesh(new THREE.CylinderGeometry(0.26, 0.23, 0.46, 8), mats.navyDark)
      thigh.position.y = -0.26
      hip.add(thigh)

      // Haidate: red thigh plate
      const thighPlate = mesh(new RoundedBoxGeometry(0.36, 0.34, 0.15, 2, 0.05), mats.red)
      thighPlate.position.set(0, -0.24, 0.19)
      hip.add(thighPlate)

      const kneeCop = mesh(new THREE.SphereGeometry(0.18, 10, 7), mats.red)
      kneeCop.position.set(0, -0.48, 0.07)
      kneeCop.scale.z = 0.82
      hip.add(kneeCop)

      const kneeTrim = mesh(new THREE.TorusGeometry(0.17, 0.024, 6, 14), mats.gold)
      kneeTrim.position.set(0, -0.48, 0.15)
      hip.add(kneeTrim)

      // Suneate: laced shin guard
      const shin = mesh(new RoundedBoxGeometry(0.4, 0.38, 0.38, 2, 0.06), mats.navyDark)
      shin.position.y = -0.72
      hip.add(shin)

      for (let i = 0; i < 3; i++) {
        const plate = mesh(new RoundedBoxGeometry(0.34, 0.1, 0.11, 2, 0.03), mats.red)
        plate.position.set(0, -0.6 - i * 0.12, 0.21)
        hip.add(plate)
      }
      studRow(hip, 3, 0.12, -0.6, 0.28, 0.9)

      // Sandal
      const foot = mesh(new RoundedBoxGeometry(0.44, 0.17, 0.58, 2, 0.06), mats.navyDark)
      foot.position.set(0, -1.0, 0.1)
      hip.add(foot)

      const sole = mesh(new RoundedBoxGeometry(0.46, 0.06, 0.6, 2, 0.02), mats.leather)
      sole.position.set(0, -1.08, 0.1)
      hip.add(sole)

      const toeStrap = mesh(new RoundedBoxGeometry(0.31, 0.07, 0.13, 2, 0.03), mats.leather)
      toeStrap.position.set(0, -0.93, 0.31)
      hip.add(toeStrap)

      const ankleStrap = mesh(new THREE.TorusGeometry(0.16, 0.028, 6, 14), mats.leather)
      ankleStrap.position.set(0, -0.9, 0.06)
      ankleStrap.rotation.x = Math.PI / 2
      hip.add(ankleStrap)

      // Feet turned slightly outward, weight settled
      hip.rotation.z = side * 0.05
      hip.rotation.y = side * 0.12
      return { hip, side }
    })

    /* ================================================================
       Body
       ================================================================ */
    const body = new THREE.Group()
    body.position.y = HIP_Y
    samurai.add(body)

    // Kusazuri: skirt panels of stacked lamellae
    const skirt = new THREE.Group()
    body.add(skirt)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.PI / 7
      const panel = new THREE.Group()
      panel.position.set(Math.sin(a) * 0.48, -0.06, Math.cos(a) * 0.42)
      panel.rotation.y = a
      panel.rotation.x = -0.15
      skirt.add(panel)

      for (let row = 0; row < 3; row++) {
        const lamella = mesh(
          new RoundedBoxGeometry(0.42 - row * 0.02, 0.15, 0.14, 2, 0.04),
          row % 2 ? mats.redDark : mats.red
        )
        lamella.position.y = -0.13 - row * 0.16
        panel.add(lamella)

        for (let s = -1; s <= 1; s += 2) {
          const lace = new THREE.Mesh(LACE, mats.gold)
          lace.castShadow = true
          lace.position.set(s * 0.12, -0.13 - row * 0.16, 0.085)
          panel.add(lace)
        }
      }

      const hem = mesh(new RoundedBoxGeometry(0.4, 0.08, 0.15, 2, 0.03), mats.navyDark)
      hem.position.y = -0.56
      panel.add(hem)
    }

    // Dō: the cuirass
    const chest = mesh(new RoundedBoxGeometry(1.02, 0.74, 0.74, 3, 0.12), mats.red)
    chest.position.y = 0.44
    body.add(chest)

    for (let i = 0; i < 4; i++) {
      const band = mesh(new RoundedBoxGeometry(1.04, 0.11, 0.77, 2, 0.035), mats.redDark)
      band.position.set(0, 0.18 + i * 0.17, 0)
      body.add(band)
      studRow(body, 5, 0.2, 0.18 + i * 0.17, 0.4, 1)
    }

    // Watagami: shoulder straps in dark metal
    ;[-1, 1].forEach((side) => {
      const strap = mesh(new RoundedBoxGeometry(0.18, 0.44, 0.17, 2, 0.05), mats.navyDark)
      strap.position.set(side * 0.31, 0.7, 0.25)
      strap.rotation.z = side * 0.3
      body.add(strap)

      const buckle = mesh(new RoundedBoxGeometry(0.14, 0.08, 0.11, 2, 0.03), mats.gold)
      buckle.position.set(side * 0.35, 0.52, 0.32)
      body.add(buckle)
    })

    // Chest device: a simple geometric mark, not a real crest
    const monPlate = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10), mats.gold)
    monPlate.position.set(0, 0.5, 0.39)
    monPlate.rotation.x = Math.PI / 2
    body.add(monPlate)

    const monRing = mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 16), mats.navyDark)
    monRing.position.set(0, 0.5, 0.41)
    body.add(monRing)

    // Obi sash
    const sash = mesh(new RoundedBoxGeometry(1.06, 0.19, 0.78, 2, 0.06), mats.cloth)
    sash.position.y = 0.06
    body.add(sash)

    const sashKnot = mesh(new RoundedBoxGeometry(0.23, 0.21, 0.17, 2, 0.05), mats.cloth)
    sashKnot.position.set(-0.32, 0.04, 0.4)
    sashKnot.rotation.z = 0.4
    body.add(sashKnot)

    const agemaki = mesh(new THREE.TorusKnotGeometry(0.1, 0.034, 48, 6), mats.cloth)
    agemaki.position.set(0, 0.52, -0.42)
    body.add(agemaki)

    ;[-1, 1].forEach((side) => {
      const tassel = mesh(new RoundedBoxGeometry(0.11, 0.23, 0.09, 2, 0.04), mats.gold)
      tassel.position.set(side * 0.55, 0.0, 0.25)
      body.add(tassel)
    })

    /* ================================================================
       Shoulders and arms — set wide, clear of the helmet
       ================================================================ */
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.7, 0.58, 0)
      body.add(shoulder)

      // Sode: layered plates
      for (let i = 0; i < 5; i++) {
        const plate = mesh(
          new RoundedBoxGeometry(0.48 + i * 0.035, 0.13, 0.58 + i * 0.035, 2, 0.045),
          i % 2 ? mats.redDark : mats.red
        )
        plate.position.set(side * 0.08, 0.08 - i * 0.13, 0)
        plate.rotation.z = side * (0.12 + i * 0.05)
        shoulder.add(plate)

        if (i < 4) {
          for (let s = -1; s <= 1; s += 2) {
            const lace = new THREE.Mesh(LACE, mats.gold)
            lace.castShadow = true
            lace.position.set(side * 0.08 + s * 0.16, 0.02 - i * 0.13, 0.29)
            shoulder.add(lace)
          }
        }
      }

      const upper = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.32, 9), mats.navyDark)
      upper.position.y = -0.48
      shoulder.add(upper)

      const elbow = new THREE.Group()
      elbow.position.y = -0.62
      shoulder.add(elbow)

      const fore = mesh(new RoundedBoxGeometry(0.32, 0.38, 0.32, 2, 0.06), mats.red)
      fore.position.y = -0.19
      elbow.add(fore)

      const foreTrim = mesh(new RoundedBoxGeometry(0.34, 0.07, 0.34, 2, 0.03), mats.gold)
      foreTrim.position.y = -0.02
      elbow.add(foreTrim)

      studRow(elbow, 2, 0.15, -0.24, 0.18, 0.9)

      const hand = mesh(new THREE.IcosahedronGeometry(0.16, 0), mats.navyDark)
      hand.position.y = -0.42
      elbow.add(hand)

      shoulder.rotation.z = side * 0.24
      elbow.rotation.x = -0.12
      return { shoulder, elbow, side }
    })

    /* ================================================================
       Head — menpo mask, kept forward and open to the light
       ================================================================ */
    const headRig = new THREE.Group()
    headRig.position.y = HEAD_Y
    samurai.add(headRig)

    const face = mesh(new THREE.IcosahedronGeometry(0.5, 1), mats.face)
    face.scale.set(1.0, 0.9, 0.94)
    headRig.add(face)

    ;[-1, 1].forEach((side) => {
      const cheek = mesh(new RoundedBoxGeometry(0.17, 0.3, 0.2, 2, 0.06), mats.navy)
      cheek.position.set(side * 0.37, -0.08, 0.22)
      cheek.rotation.y = side * -0.4
      headRig.add(cheek)
    })

    // Level brow, set a little higher — attentive rather than scowling.
    const brow = mesh(new RoundedBoxGeometry(0.74, 0.085, 0.17, 2, 0.032), mats.navyDark)
    brow.position.set(0, 0.275, 0.39)
    headRig.add(brow)

    // Visor recess: a dark band the glowing eyes sit inside
    const recess = mesh(new RoundedBoxGeometry(0.78, 0.24, 0.1, 2, 0.04), mats.navyDark)
    recess.position.set(0, 0.09, 0.43)
    headRig.add(recess)

    // A steep inward-down rake is what reads as anger, so it stays shallow
    // here: long, narrow, nearly level slits read as a focused squint.
    const eyeGeo = track(new RoundedBoxGeometry(0.27, 0.066, 0.05, 2, 0.018))
    const eyes = [-0.19, 0.19].map((x) => {
      const eye = new THREE.Mesh(eyeGeo, mats.eye)
      eye.position.set(x, 0.1, 0.49)
      eye.rotation.z = x < 0 ? -0.08 : 0.08
      headRig.add(eye)
      return eye
    })

    const nose = mesh(new THREE.ConeGeometry(0.09, 0.19, 4), mats.navy)
    nose.position.set(0, -0.03, 0.45)
    nose.rotation.x = -0.4
    headRig.add(nose)

    const guard = mesh(new RoundedBoxGeometry(0.56, 0.26, 0.3, 2, 0.08), mats.navyDark)
    guard.position.set(0, -0.2, 0.29)
    headRig.add(guard)

    // Menpo vents: a quiet respirator line. The gold grimace of teeth that
    // sat here read as a snarl, which is the other half of "angry".
    const ventGeo = track(new RoundedBoxGeometry(0.33, 0.026, 0.035, 2, 0.011))
    for (let i = 0; i < 3; i++) {
      const vent = new THREE.Mesh(ventGeo, mats.navy)
      vent.castShadow = true
      vent.position.set(0, -0.1 - i * 0.056, 0.44)
      headRig.add(vent)
    }

    const ventTrim = mesh(new RoundedBoxGeometry(0.37, 0.022, 0.04, 2, 0.01), mats.gold)
    ventTrim.position.set(0, -0.032, 0.435)
    headRig.add(ventTrim)

    const chin = mesh(new THREE.ConeGeometry(0.19, 0.21, 5), mats.navyDark)
    chin.position.set(0, -0.33, 0.23)
    chin.rotation.x = Math.PI
    headRig.add(chin)

    // Neck scarf
    const scarf = mesh(new THREE.TorusGeometry(0.38, 0.11, 6, 16), mats.cloth)
    scarf.position.y = -0.42
    scarf.rotation.x = Math.PI / 2
    headRig.add(scarf)

    const knot = mesh(new RoundedBoxGeometry(0.19, 0.21, 0.14, 2, 0.05), mats.cloth)
    knot.position.set(0.05, -0.49, 0.33)
    knot.rotation.z = 0.3
    headRig.add(knot)

    const tails = [0.12, -0.06].map((x, i) => {
      const tail = mesh(new RoundedBoxGeometry(0.14, 0.42, 0.08, 2, 0.04), mats.cloth)
      tail.position.set(x, -0.76 - i * 0.06, 0.29 - i * 0.05)
      tail.rotation.z = 0.2 - i * 0.35
      headRig.add(tail)
      return tail
    })

    /* ================================================================
       Kabuto
       ================================================================ */
    const helmet = new THREE.Group()
    helmet.position.y = 0.14
    headRig.add(helmet)

    const bowl = mesh(
      new THREE.SphereGeometry(0.64, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mats.bowl
    )
    bowl.position.y = 0.16
    bowl.scale.y = 1.12
    helmet.add(bowl)

    const seamGeo = track(new THREE.BoxGeometry(0.03, 0.05, 0.68))
    for (let i = 0; i < 6; i++) {
      const seam = new THREE.Mesh(seamGeo, mats.gold)
      seam.castShadow = true
      seam.position.y = 0.36
      seam.rotation.y = (i / 6) * Math.PI
      seam.rotation.x = 0.1
      helmet.add(seam)
    }

    const tehen = mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), mats.gold)
    tehen.position.y = 0.66
    tehen.rotation.x = Math.PI / 2
    helmet.add(tehen)

    const crown = mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.1, 8), mats.redDark)
    crown.position.y = 0.6
    helmet.add(crown)

    // Mabisashi: brim sits above the eye line and angles up, so the face is lit
    const brim = mesh(
      new THREE.CylinderGeometry(0.86, 0.62, 0.13, 14, 1, true),
      mats.redDark
    )
    brim.position.set(0, 0.26, 0.02)
    brim.rotation.x = -0.3
    helmet.add(brim)

    const brimEdge = mesh(
      new THREE.CylinderGeometry(0.89, 0.85, 0.05, 14, 1, true),
      mats.gold
    )
    brimEdge.position.set(0, 0.2, 0.02)
    brimEdge.rotation.x = -0.3
    helmet.add(brimEdge)

    // Shikoro: a REAR ARC, so it frames the head instead of burying it
    for (let i = 0; i < 4; i++) {
      const ring = mesh(
        new THREE.CylinderGeometry(
          0.66 + i * 0.05,
          0.73 + i * 0.05,
          0.13,
          14,
          1,
          true,
          SHIKORO_START,
          SHIKORO_SWEEP
        ),
        i % 2 ? mats.redDark : mats.red
      )
      ring.position.set(0, 0.1 - i * 0.135, -0.1)
      ring.rotation.x = 0.22
      helmet.add(ring)

      if (i < 3) {
        for (let s = 0; s < 5; s++) {
          const a = SHIKORO_START + ((s + 0.5) / 5) * SHIKORO_SWEEP
          const r = 0.7 + i * 0.05
          const lace = new THREE.Mesh(LACE, mats.gold)
          lace.castShadow = true
          lace.position.set(Math.sin(a) * r, 0.04 - i * 0.135, Math.cos(a) * r - 0.1)
          helmet.add(lace)
        }
      }
    }

    // Fukigaeshi: swept plates either side of the brim
    ;[-1, 1].forEach((side) => {
      const wing = mesh(new RoundedBoxGeometry(0.26, 0.34, 0.09, 2, 0.04), mats.red)
      wing.position.set(side * 0.74, 0.3, 0.12)
      wing.rotation.set(0.12, side * -0.55, side * 0.28)
      helmet.add(wing)

      const wingTrim = mesh(new RoundedBoxGeometry(0.27, 0.06, 0.1, 2, 0.025), mats.gold)
      wingTrim.position.set(side * 0.76, 0.45, 0.12)
      wingTrim.rotation.set(0.12, side * -0.55, side * 0.28)
      helmet.add(wingTrim)
    })

    // Maedate: the gold crest
    const crest = new THREE.Group()
    crest.position.set(0, 0.5, 0.14)
    helmet.add(crest)

    const hornPath = (dir) =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(dir * 0.06, 0, 0),
        new THREE.Vector3(dir * 0.4, 0.18, 0),
        new THREE.Vector3(dir * 0.64, 0.5, 0),
        new THREE.Vector3(dir * 0.66, 0.85, 0),
        new THREE.Vector3(dir * 0.52, 1.04, 0),
      ])

    ;[-1, 1].forEach((dir) => {
      const horn = mesh(new THREE.TubeGeometry(hornPath(dir), 16, 0.105, 8, false), mats.gold)
      horn.scale.z = 0.52
      crest.add(horn)
    })

    const crestBase = mesh(new RoundedBoxGeometry(0.4, 0.17, 0.13, 2, 0.05), mats.gold)
    crestBase.position.y = -0.02
    crest.add(crestBase)

    const crestGem = mesh(new THREE.OctahedronGeometry(0.12, 0), mats.redDark)
    crestGem.position.set(0, 0.2, 0.03)
    crest.add(crestGem)

    /* ================================================================
       Swords
       ================================================================ */
    const katana = new THREE.Group()
    arms[1].elbow.add(katana)
    katana.position.set(0.03, -0.44, 0.12)
    katana.rotation.set(-0.38, 0.12, -0.58)

    const grip = mesh(new RoundedBoxGeometry(0.11, 0.54, 0.11, 2, 0.035), mats.leather)
    grip.position.y = -0.13
    katana.add(grip)

    const wrapGeo = track(new THREE.OctahedronGeometry(0.043, 0))
    for (let i = 0; i < 5; i++) {
      const wrap = new THREE.Mesh(wrapGeo, mats.gold)
      wrap.castShadow = true
      wrap.position.set(0, 0.06 - i * 0.1, 0.06)
      katana.add(wrap)
    }

    const pommel = mesh(new RoundedBoxGeometry(0.14, 0.08, 0.14, 2, 0.03), mats.gold)
    pommel.position.y = -0.42
    katana.add(pommel)

    const tsuba = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), mats.gold)
    tsuba.position.y = 0.18
    katana.add(tsuba)

    const habaki = mesh(new RoundedBoxGeometry(0.1, 0.09, 0.05, 2, 0.02), mats.gold)
    habaki.position.y = 0.24
    katana.add(habaki)

    const blade = new THREE.Group()
    blade.position.y = 0.21
    katana.add(blade)

    const lowerBlade = mesh(new THREE.BoxGeometry(0.082, 1.32, 0.026), mats.steel)
    lowerBlade.position.y = 0.66
    blade.add(lowerBlade)

    const upperSeg = new THREE.Group()
    upperSeg.position.y = 1.31
    upperSeg.rotation.z = -0.12
    blade.add(upperSeg)

    const upperBlade = mesh(new THREE.BoxGeometry(0.082, 0.96, 0.026), mats.steel)
    upperBlade.position.y = 0.48
    upperSeg.add(upperBlade)

    const tip = mesh(new THREE.ConeGeometry(0.06, 0.3, 4), mats.steel)
    tip.position.y = 1.1
    tip.rotation.y = Math.PI / 4
    upperSeg.add(tip)

    // Wakizashi through the sash
    const waki = new THREE.Group()
    waki.position.set(-0.5, 0.1, 0.18)
    waki.rotation.set(0.22, 0, 0.5)
    body.add(waki)

    const saya = mesh(new RoundedBoxGeometry(0.11, 0.88, 0.11, 2, 0.04), mats.navyDark)
    saya.position.y = 0.2
    waki.add(saya)

    const sayaTip = mesh(new THREE.ConeGeometry(0.075, 0.14, 6), mats.gold)
    sayaTip.position.y = 0.7
    waki.add(sayaTip)

    const wakiTsuba = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10), mats.gold)
    wakiTsuba.position.y = -0.27
    waki.add(wakiTsuba)

    const wakiGrip = mesh(new RoundedBoxGeometry(0.1, 0.3, 0.1, 2, 0.03), mats.leather)
    wakiGrip.position.y = -0.45
    waki.add(wakiGrip)

    /* ================================================================
       Stage — contact shadow plus a soft pool under the feet
       ================================================================ */
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 })
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(22, 22)), shadowMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    // A painted falloff disc that grounds the figure where the shadow map
    // alone goes too soft.
    const poolCanvas = document.createElement('canvas')
    poolCanvas.width = poolCanvas.height = 128
    const pctx = poolCanvas.getContext('2d')
    const grad = pctx.createRadialGradient(64, 64, 2, 64, 64, 62)
    grad.addColorStop(0, 'rgba(0,0,0,0.5)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.2)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    pctx.fillStyle = grad
    pctx.fillRect(0, 0, 128, 128)

    const poolTex = new THREE.CanvasTexture(poolCanvas)
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      depthWrite: false,
    })
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(3.4, 3.4)), poolMat)
    pool.rotation.x = -Math.PI / 2
    pool.position.y = 0.012
    scene.add(pool)

    /* ---- Cursor tracking ---- */
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
    let stanceIn = 5
    const STANCE_LEN = 2.4

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible) return

      const delta = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      samurai.position.y = Math.sin(t * 1.1) * 0.025
      samurai.rotation.z = Math.sin(t * 0.5) * 0.012
      body.rotation.y = Math.sin(t * 0.42) * 0.05
      body.scale.set(1, 1 + Math.sin(t * 1.45) * 0.009, 1)
      skirt.rotation.y = Math.sin(t * 0.42) * 0.035

      tails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(t * 1.2 + i * 0.8) * 0.11
      })

      look.x += (target.x - look.x) * 0.05
      look.y += (target.y - look.y) * 0.05
      headRig.rotation.y = look.x * 0.34 + Math.sin(t * 0.33) * 0.03
      headRig.rotation.x = look.y * 0.14
      headRig.rotation.z = Math.sin(t * 0.47) * 0.018

      // A slow, steady glow: a hard pulse reads as agitation, a calm one
      // reads as concentration.
      mats.eye.emissiveIntensity = 1.02 + Math.sin(t * 0.85) * 0.13
      eyes.forEach((eye, i) => {
        eye.scale.y = 1 + Math.sin(t * 0.85 + i) * 0.03
      })

      stanceIn -= delta
      const inStance = stanceIn < STANCE_LEN
      if (stanceIn <= 0) stanceIn = 8 + Math.random() * 4
      const p = inStance ? Math.sin((1 - stanceIn / STANCE_LEN) * Math.PI) : 0

      arms.forEach(({ shoulder, elbow, side }) => {
        const idle = Math.sin(t * 1.05 + side) * 0.04

        if (side === 1) {
          shoulder.rotation.z = side * (0.24 - p * 0.58)
          shoulder.rotation.x = idle - p * 0.72
          elbow.rotation.x = -0.12 - p * 0.58
        } else {
          shoulder.rotation.z = side * (0.24 + p * 0.22)
          shoulder.rotation.x = idle - p * 0.2
          elbow.rotation.x = -0.12 - p * 0.26
        }
      })

      katana.rotation.z = -0.58 + p * 0.52
      katana.rotation.x = -0.38 + p * 0.32

      legs.forEach(({ hip, side }) => {
        hip.rotation.x = Math.sin(t * 0.5 + side * 1.6) * 0.014
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
      mats.red.color.copy(cssColor('--samurai-accent', '#c0392b'))
      mats.redDark.color.copy(cssColor('--samurai-accent-dark', '#8e2a1e'))
      mats.navy.color.copy(cssColor('--samurai-armor', '#39414f'))
      mats.navyDark.color.copy(cssColor('--samurai-armor-dark', '#22272f'))
      mats.gold.color.copy(cssColor('--samurai-gold', '#e0a63a'))
      mats.bowl.color.copy(cssColor('--samurai-bowl', '#e8e1d4'))
      mats.steel.color.copy(cssColor('--samurai-steel', '#e9edf4'))
      mats.cloth.color.copy(cssColor('--samurai-cloth', '#a8322a'))
      mats.leather.color.copy(cssColor('--samurai-leather', '#4a3b33'))
      mats.face.color.copy(cssColor('--samurai-face', '#2f3642'))
      const eye = cssColor('--samurai-eye', '#ffb347')
      mats.eye.color.copy(eye)
      mats.eye.emissive.copy(eye)
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

      geos.forEach((g) => g.dispose())
      geos.clear()
      allMats.forEach((m) => m.dispose())
      shadowMat.dispose()
      poolMat.dispose()
      poolTex.dispose()
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
