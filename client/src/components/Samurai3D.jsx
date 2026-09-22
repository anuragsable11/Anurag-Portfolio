import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createVisibilityGate, cssColor } from '../lib/three-utils.js'

/**
 * An original stylised samurai mascot, modelled from primitives.
 *
 * Built the way real armour is: a dark fabric body underneath, with separate
 * curved plates laced over the top and visible gaps between them. Nothing is
 * a solid shell and nothing is a stacked rectangular band — every plate is an
 * open partial cylinder, so all its edges curve with the body.
 *
 * Proportions are compact and slightly chibi. Surfaces are flat-shaded for
 * the faceted look, with materials separated by surface type: glossy red
 * lacquer, dark metal, polished gold, matte fabric, rope, mirror steel.
 *
 * Layout, bottom to top (world units, floor at y = 0):
 *   0.04  sandals        1.15  hips / sash (HIP_Y)
 *   0.65  knees          1.87  shoulders
 *   2.32  eye line       2.95  helmet crown
 *   3.78  crest tips
 *
 * The katana hangs at the right side, blade down — relaxed, not brandished.
 * Drag to orbit a full 360°. Colours come from the --samurai-* CSS tokens.
 */

const HIP_Y = 1.15
const HEAD_Y = 2.22

// Partial-cylinder helpers. three.js starts theta at +Z (the front) and
// sweeps toward +X, so each arc is described by the angle it centres on.
const arc = (center, sweep) => [center - sweep / 2, sweep]
const FRONT = 0
const BACK = Math.PI
const RIGHT = Math.PI / 2
const LEFT = -Math.PI / 2

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
    // Kept under 1: ACES desaturates saturated reds toward coral as they
    // approach clipping. A darker exposure keeps the lacquer red.
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
    camera.position.set(1.4, 2.6, 8.8)

    /* ================================================================
       Studio lighting: warm key, two cool rims, dim fill
       ================================================================ */
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture
    scene.environmentIntensity = 0.42

    const key = new THREE.DirectionalLight(0xfff3e6, 2.5)
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
    key.shadow.normalBias = 0.024
    key.shadow.radius = 4

    const rimL = new THREE.DirectionalLight(0xa8c8ff, 2.3)
    rimL.position.set(-4.5, 3.5, -5)
    const rimR = new THREE.DirectionalLight(0xbcd4ff, 1.5)
    rimR.position.set(4.5, 2.5, -4.5)
    const fill = new THREE.DirectionalLight(0xdfe7f5, 0.3)
    fill.position.set(-3.5, 1.2, 4)
    scene.add(key, rimL, rimR, fill)

    /* ---- Controls ---- */
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.95, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = 0.85
    controls.minPolarAngle = 0.55
    controls.maxPolarAngle = Math.PI / 2 + 0.14
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.7

    // Touch drags orbit as well. OrbitControls otherwise pins the canvas to
    // `touch-action: none`, which swallows page scrolling, so it is put back
    // to `pan-y`: a sideways drag spins the samurai, while a vertical swipe
    // is claimed by the browser to scroll and cancels the drag mid-gesture.
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

    /* ================================================================
       Materials — plates are open surfaces, so they render both faces
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
        side: THREE.DoubleSide,
        ...extra,
      })

    const mats = {
      fabric: flat('--samurai-fabric', '#171a21', { roughness: 0.96, metalness: 0.0 }),
      red: flat('--samurai-accent', '#c0392b', { roughness: 0.3, metalness: 0.08 }),
      redDark: flat('--samurai-accent-dark', '#8e2a1e', { roughness: 0.36, metalness: 0.1 }),
      metal: flat('--samurai-armor', '#39414f', { roughness: 0.34, metalness: 0.82 }),
      metalDark: flat('--samurai-armor-dark', '#22272f', { roughness: 0.3, metalness: 0.88 }),
      gold: flat('--samurai-gold', '#e0a63a', { roughness: 0.18, metalness: 0.96 }),
      rope: flat('--samurai-rope', '#b8935a', { roughness: 0.88, metalness: 0.02 }),
      bowl: flat('--samurai-bowl', '#e8e1d4', { roughness: 0.28, metalness: 0.3 }),
      steel: flat('--samurai-steel', '#e9edf4', { roughness: 0.05, metalness: 1.0 }),
      cloth: flat('--samurai-cloth', '#a8322a', { roughness: 0.92, metalness: 0.0 }),
      leather: flat('--samurai-leather', '#4a3b33', { roughness: 0.85, metalness: 0.04 }),
      face: flat('--samurai-face', '#2f3642', { roughness: 0.42, metalness: 0.6 }),
      eye: flat('--samurai-eye', '#ffb347', {
        roughness: 0.3,
        metalness: 0.1,
        emissive: cssColor('--samurai-eye', '#ffb347'),
        emissiveIntensity: 0.8,
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

    /** An open, curved armour plate: a slice of a cylinder wall. */
    const plate = (rTop, rBottom, height, [start, sweep], material, segs = 10) =>
      mesh(
        new THREE.CylinderGeometry(rTop, rBottom, height, segs, 1, true, start, sweep),
        material
      )

    const STUD = track(new THREE.CylinderGeometry(0.03, 0.03, 0.026, 6))
    const stud = (parent, x, y, z, rotY = 0) => {
      const s = new THREE.Mesh(STUD, mats.gold)
      s.castShadow = true
      s.position.set(x, y, z)
      s.rotation.set(Math.PI / 2, 0, rotY)
      parent.add(s)
      return s
    }

    /* ================================================================
       Legs — fabric underneath, a knee cop and one curved shin plate
       ================================================================ */
    const legs = [-1, 1].map((side) => {
      const hip = new THREE.Group()
      hip.position.set(side * 0.32, HIP_Y, 0)
      samurai.add(hip)

      const thigh = mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.46, 9), mats.fabric)
      thigh.position.y = -0.25
      hip.add(thigh)

      // Haidate: a small plate over the front of the thigh only
      const thighPlate = plate(0.2, 0.22, 0.26, arc(FRONT, Math.PI * 0.6), mats.red)
      thighPlate.position.y = -0.2
      hip.add(thighPlate)
      stud(hip, 0, -0.1, 0.21)

      const kneeCop = mesh(new THREE.SphereGeometry(0.15, 10, 7), mats.red)
      kneeCop.position.set(0, -0.5, 0.06)
      kneeCop.scale.z = 0.8
      hip.add(kneeCop)

      const kneeTrim = mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 14), mats.gold)
      kneeTrim.position.set(0, -0.5, 0.13)
      hip.add(kneeTrim)

      const shin = mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.4, 9), mats.fabric)
      shin.position.y = -0.77
      hip.add(shin)

      // Suneate: one plate over the front of the shin, laced on
      const shinPlate = plate(0.17, 0.18, 0.34, arc(FRONT, Math.PI * 0.85), mats.metal)
      shinPlate.position.y = -0.78
      hip.add(shinPlate)

      const shinTrim = plate(0.185, 0.19, 0.03, arc(FRONT, Math.PI * 0.85), mats.gold)
      shinTrim.position.y = -0.62
      hip.add(shinTrim)

      const shinCord = mesh(new THREE.TorusGeometry(0.16, 0.014, 5, 12), mats.rope)
      shinCord.position.y = -0.7
      shinCord.rotation.x = Math.PI / 2
      hip.add(shinCord)

      const foot = mesh(new RoundedBoxGeometry(0.4, 0.15, 0.54, 2, 0.06), mats.metalDark)
      foot.position.set(0, -1.02, 0.09)
      hip.add(foot)

      const sole = mesh(new RoundedBoxGeometry(0.42, 0.05, 0.56, 2, 0.02), mats.leather)
      sole.position.set(0, -1.1, 0.09)
      hip.add(sole)

      const toeStrap = mesh(new RoundedBoxGeometry(0.28, 0.06, 0.12, 2, 0.03), mats.leather)
      toeStrap.position.set(0, -0.96, 0.29)
      hip.add(toeStrap)

      hip.rotation.z = side * 0.05
      hip.rotation.y = side * 0.1
      return { hip, side }
    })

    /* ================================================================
       Body — fabric torso, a medium cuirass, separated waist plates
       ================================================================ */
    const body = new THREE.Group()
    body.position.y = HIP_Y
    samurai.add(body)

    // The undergarment. Every armour piece sits on top of this with a gap.
    const torso = mesh(new RoundedBoxGeometry(0.7, 0.82, 0.5, 4, 0.2), mats.fabric)
    torso.position.y = 0.46
    body.add(torso)

    const neck = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 9), mats.fabric)
    neck.position.y = 0.93
    body.add(neck)

    // Dō: a front plate and a smaller back plate, open at both sides
    const cuirass = new THREE.Group()
    cuirass.position.y = 0.52
    cuirass.scale.z = 0.74
    body.add(cuirass)

    const doFront = plate(0.42, 0.45, 0.52, arc(FRONT, Math.PI * 0.82), mats.red, 12)
    cuirass.add(doFront)

    const doBack = plate(0.42, 0.44, 0.46, arc(BACK, Math.PI * 0.62), mats.red, 12)
    doBack.position.y = 0.02
    cuirass.add(doBack)

    // Lacing cords across the plate, instead of more stacked bands
    ;[-0.16, 0.0, 0.16].forEach((y) => {
      const row = plate(0.455, 0.455, 0.022, arc(FRONT, Math.PI * 0.78), mats.rope, 12)
      row.position.y = y
      cuirass.add(row)
    })

    ;[-0.3, 0.3].forEach((x) => {
      stud(cuirass, x, 0.2, 0.32)
      stud(cuirass, x, -0.18, 0.32)
    })

    // Chest device: a simple geometric mark on a gold disc
    const monPlate = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10), mats.gold)
    monPlate.position.set(0, 0.06, 0.62)
    monPlate.rotation.x = Math.PI / 2
    cuirass.add(monPlate)

    const monRing = mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 14), mats.metalDark)
    monRing.position.set(0, 0.06, 0.64)
    cuirass.add(monRing)

    // Watagami: rope shoulder straps tying the cuirass on
    ;[-1, 1].forEach((side) => {
      const strap = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), mats.rope)
      strap.position.set(side * 0.24, 0.82, 0.22)
      strap.rotation.z = side * 0.25
      body.add(strap)
    })

    // Obi sash, with a knot on the left hip
    const sash = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12, 1, true), mats.cloth)
    sash.position.y = 0.1
    sash.scale.z = 0.74
    body.add(sash)

    const sashKnot = mesh(new RoundedBoxGeometry(0.2, 0.18, 0.15, 2, 0.05), mats.cloth)
    sashKnot.position.set(-0.3, 0.08, 0.32)
    sashKnot.rotation.z = 0.4
    body.add(sashKnot)

    const sashTail = mesh(new RoundedBoxGeometry(0.1, 0.3, 0.06, 2, 0.03), mats.cloth)
    sashTail.position.set(-0.36, -0.12, 0.3)
    sashTail.rotation.z = 0.2
    body.add(sashTail)

    // Kusazuri: six separate plates hanging off the sash, with gaps between
    const skirt = new THREE.Group()
    skirt.position.y = -0.04
    skirt.scale.z = 0.76
    body.add(skirt)

    for (let i = 0; i < 6; i++) {
      const center = (i / 6) * Math.PI * 2
      const p = plate(0.44, 0.52, 0.36, arc(center, Math.PI * 0.24), mats.red, 4)
      p.position.y = -0.18
      skirt.add(p)

      const hem = plate(0.525, 0.53, 0.035, arc(center, Math.PI * 0.24), mats.redDark, 4)
      hem.position.y = -0.36
      skirt.add(hem)

      // The fastener each plate hangs from
      stud(skirt, Math.sin(center) * 0.45, -0.02, Math.cos(center) * 0.45, center)
    }

    /* ================================================================
       Shoulders and arms — sode of three plates over fabric sleeves
       ================================================================ */
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.46, 0.72, 0)
      body.add(shoulder)

      const cord = mesh(new THREE.TorusGeometry(0.09, 0.02, 5, 10), mats.rope)
      cord.position.set(side * 0.02, 0.1, 0)
      cord.rotation.x = Math.PI / 2
      shoulder.add(cord)

      const capKnot = mesh(new THREE.SphereGeometry(0.045, 6, 5), mats.rope)
      capKnot.position.set(side * 0.02, 0.12, 0)
      shoulder.add(capKnot)

      // Three plates draped over the outside of the shoulder, gaps between
      const outward = side > 0 ? RIGHT : LEFT
      for (let i = 0; i < 3; i++) {
        const p = plate(
          0.24 + i * 0.025,
          0.27 + i * 0.025,
          0.1,
          arc(outward, Math.PI * 0.88),
          i === 1 ? mats.redDark : mats.red
        )
        p.position.y = 0.02 - i * 0.135
        p.rotation.z = side * -0.12
        shoulder.add(p)
      }

      const upper = mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.34, 9), mats.fabric)
      upper.position.y = -0.36
      shoulder.add(upper)

      const elbow = new THREE.Group()
      elbow.position.y = -0.56
      shoulder.add(elbow)

      const fore = mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.36, 9), mats.fabric)
      fore.position.y = -0.18
      elbow.add(fore)

      // Kote: a small plate on the outside of the forearm
      const kote = plate(0.125, 0.13, 0.26, arc(outward, Math.PI * 0.85), mats.red)
      kote.position.y = -0.17
      elbow.add(kote)

      const koteTrim = plate(0.132, 0.135, 0.028, arc(outward, Math.PI * 0.85), mats.gold)
      koteTrim.position.y = -0.04
      elbow.add(koteTrim)

      stud(elbow, side * 0.13, -0.19, 0, Math.PI / 2)

      const hand = mesh(new THREE.IcosahedronGeometry(0.13, 0), mats.metalDark)
      hand.position.y = -0.4
      elbow.add(hand)

      shoulder.rotation.z = side * 0.16
      elbow.rotation.x = -0.1
      return { shoulder, elbow, side }
    })

    /* ================================================================
       Head — a dark mask with subtly lit eyes
       ================================================================ */
    const headRig = new THREE.Group()
    headRig.position.y = HEAD_Y
    samurai.add(headRig)

    const face = mesh(new THREE.IcosahedronGeometry(0.46, 1), mats.face)
    face.scale.set(1.0, 0.92, 0.94)
    headRig.add(face)

    ;[-1, 1].forEach((side) => {
      const cheek = mesh(new RoundedBoxGeometry(0.15, 0.28, 0.18, 2, 0.06), mats.metal)
      cheek.position.set(side * 0.34, -0.08, 0.2)
      cheek.rotation.y = side * -0.4
      headRig.add(cheek)
    })

    const brow = mesh(new RoundedBoxGeometry(0.68, 0.08, 0.16, 2, 0.03), mats.metalDark)
    brow.position.set(0, 0.26, 0.36)
    headRig.add(brow)

    const recess = mesh(new RoundedBoxGeometry(0.72, 0.22, 0.1, 2, 0.04), mats.metalDark)
    recess.position.set(0, 0.09, 0.39)
    headRig.add(recess)

    // Long, nearly level slits: focused rather than angry
    const eyeGeo = track(new RoundedBoxGeometry(0.25, 0.06, 0.05, 2, 0.017))
    const eyes = [-0.175, 0.175].map((x) => {
      const eye = new THREE.Mesh(eyeGeo, mats.eye)
      eye.position.set(x, 0.1, 0.45)
      eye.rotation.z = x < 0 ? -0.08 : 0.08
      headRig.add(eye)
      return eye
    })

    const nose = mesh(new THREE.ConeGeometry(0.08, 0.17, 4), mats.metal)
    nose.position.set(0, -0.03, 0.41)
    nose.rotation.x = -0.4
    headRig.add(nose)

    const guard = mesh(new RoundedBoxGeometry(0.52, 0.24, 0.28, 2, 0.08), mats.metalDark)
    guard.position.set(0, -0.19, 0.26)
    headRig.add(guard)

    const ventGeo = track(new RoundedBoxGeometry(0.3, 0.024, 0.032, 2, 0.01))
    for (let i = 0; i < 3; i++) {
      const vent = new THREE.Mesh(ventGeo, mats.metal)
      vent.castShadow = true
      vent.position.set(0, -0.1 - i * 0.052, 0.4)
      headRig.add(vent)
    }

    const chin = mesh(new THREE.ConeGeometry(0.17, 0.19, 5), mats.metalDark)
    chin.position.set(0, -0.31, 0.21)
    chin.rotation.x = Math.PI
    headRig.add(chin)

    const scarf = mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 16), mats.cloth)
    scarf.position.y = -0.4
    scarf.rotation.x = Math.PI / 2
    headRig.add(scarf)

    const tails = [0.1, -0.06].map((x, i) => {
      const tail = mesh(new RoundedBoxGeometry(0.13, 0.38, 0.07, 2, 0.035), mats.cloth)
      tail.position.set(x, -0.7 - i * 0.05, 0.27 - i * 0.05)
      tail.rotation.z = 0.2 - i * 0.35
      headRig.add(tail)
      return tail
    })

    /* ================================================================
       Kabuto — refined bowl, front visor, three-plate shikoro, gold horns
       ================================================================ */
    const helmet = new THREE.Group()
    helmet.position.y = 0.14
    headRig.add(helmet)

    const bowl = mesh(
      new THREE.SphereGeometry(0.6, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.bowl
    )
    bowl.position.y = 0.16
    bowl.scale.y = 1.12
    helmet.add(bowl)

    const seamGeo = track(new THREE.BoxGeometry(0.026, 0.045, 0.62))
    for (let i = 0; i < 6; i++) {
      const seam = new THREE.Mesh(seamGeo, mats.gold)
      seam.castShadow = true
      seam.position.y = 0.36
      seam.rotation.y = (i / 6) * Math.PI
      seam.rotation.x = 0.1
      helmet.add(seam)
    }

    const tehen = mesh(new THREE.TorusGeometry(0.09, 0.028, 8, 16), mats.gold)
    tehen.position.y = 0.66
    tehen.rotation.x = Math.PI / 2
    helmet.add(tehen)

    // Mabisashi: a front visor rather than a full brim
    const visor = plate(0.8, 0.6, 0.12, arc(FRONT, Math.PI * 1.05), mats.redDark, 14)
    visor.position.set(0, 0.26, 0.02)
    visor.rotation.x = -0.32
    helmet.add(visor)

    const visorEdge = plate(0.825, 0.795, 0.045, arc(FRONT, Math.PI * 1.05), mats.gold, 14)
    visorEdge.position.set(0, 0.2, 0.02)
    visorEdge.rotation.x = -0.32
    helmet.add(visorEdge)

    // Shikoro: three separate rear plates with gaps, each laced on
    for (let i = 0; i < 3; i++) {
      const ring = plate(
        0.62 + i * 0.05,
        0.68 + i * 0.05,
        0.1,
        arc(BACK, Math.PI * 1.44),
        i === 1 ? mats.redDark : mats.red,
        14
      )
      ring.position.set(0, 0.08 - i * 0.135, -0.08)
      ring.rotation.x = 0.22
      helmet.add(ring)

      for (let s = 0; s < 4; s++) {
        const a = BACK - Math.PI * 0.55 + ((s + 0.5) / 4) * Math.PI * 1.1
        const r = 0.65 + i * 0.05
        stud(helmet, Math.sin(a) * r, 0.14 - i * 0.135, Math.cos(a) * r - 0.08, a)
      }
    }

    // Fukigaeshi: small swept wings beside the visor
    ;[-1, 1].forEach((side) => {
      const wing = plate(0.2, 0.22, 0.28, arc(side > 0 ? RIGHT : LEFT, Math.PI * 0.7), mats.red)
      wing.position.set(side * 0.62, 0.3, 0.1)
      wing.rotation.set(0.1, 0, side * 0.3)
      helmet.add(wing)
    })

    // Maedate: two elegant gold horns
    const crest = new THREE.Group()
    crest.position.set(0, 0.5, 0.12)
    helmet.add(crest)

    const hornPath = (dir) =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(dir * 0.05, 0, 0),
        new THREE.Vector3(dir * 0.34, 0.14, 0),
        new THREE.Vector3(dir * 0.58, 0.42, 0),
        new THREE.Vector3(dir * 0.64, 0.78, 0),
        new THREE.Vector3(dir * 0.54, 1.02, 0),
        new THREE.Vector3(dir * 0.42, 1.12, 0),
      ])

    ;[-1, 1].forEach((dir) => {
      const horn = mesh(new THREE.TubeGeometry(hornPath(dir), 24, 0.078, 8, false), mats.gold)
      horn.scale.z = 0.55
      crest.add(horn)
    })

    const crestBase = mesh(new RoundedBoxGeometry(0.34, 0.15, 0.12, 2, 0.045), mats.gold)
    crestBase.position.y = -0.02
    crest.add(crestBase)

    /* ================================================================
       Katana — a single blade, hanging at the right side
       ================================================================ */
    const katana = new THREE.Group()
    arms[1].elbow.add(katana)
    katana.position.set(0.02, -0.4, 0.04)
    // Rotated past vertical so the blade points down and slightly back.
    katana.rotation.set(0.18, 0, Math.PI + 0.1)

    const grip = mesh(new RoundedBoxGeometry(0.1, 0.5, 0.1, 2, 0.032), mats.leather)
    grip.position.y = -0.12
    katana.add(grip)

    const wrapGeo = track(new THREE.OctahedronGeometry(0.04, 0))
    for (let i = 0; i < 5; i++) {
      const wrap = new THREE.Mesh(wrapGeo, mats.gold)
      wrap.castShadow = true
      wrap.position.set(0, 0.06 - i * 0.095, 0.055)
      katana.add(wrap)
    }

    const pommel = mesh(new RoundedBoxGeometry(0.13, 0.07, 0.13, 2, 0.03), mats.gold)
    pommel.position.y = -0.4
    katana.add(pommel)

    const tsuba = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.045, 12), mats.gold)
    tsuba.position.y = 0.16
    katana.add(tsuba)

    const habaki = mesh(new RoundedBoxGeometry(0.09, 0.08, 0.045, 2, 0.02), mats.gold)
    habaki.position.y = 0.22
    katana.add(habaki)

    const blade = new THREE.Group()
    blade.position.y = 0.19
    katana.add(blade)

    const lowerBlade = mesh(new THREE.BoxGeometry(0.075, 1.24, 0.024), mats.steel)
    lowerBlade.position.y = 0.62
    blade.add(lowerBlade)

    const upperSeg = new THREE.Group()
    upperSeg.position.y = 1.23
    upperSeg.rotation.z = -0.11
    blade.add(upperSeg)

    const upperBlade = mesh(new THREE.BoxGeometry(0.075, 0.9, 0.024), mats.steel)
    upperBlade.position.y = 0.45
    upperSeg.add(upperBlade)

    const tip = mesh(new THREE.ConeGeometry(0.055, 0.28, 4), mats.steel)
    tip.position.y = 1.03
    tip.rotation.y = Math.PI / 4
    upperSeg.add(tip)

    /* ================================================================
       Ground — shadow map plus a painted contact pool
       ================================================================ */
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 })
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(22, 22)), shadowMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

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
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, 3.2)), poolMat)
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

    /* ---- Animation: a relaxed idle, nothing brandished ---- */
    const clock = new THREE.Clock()
    let frame = null

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!gate.visible) return

      clock.getDelta()
      const t = clock.elapsedTime

      samurai.position.y = Math.sin(t * 1.1) * 0.022
      samurai.rotation.z = Math.sin(t * 0.5) * 0.01
      body.rotation.y = Math.sin(t * 0.42) * 0.045
      torso.scale.set(1, 1 + Math.sin(t * 1.45) * 0.012, 1)
      skirt.rotation.y = Math.sin(t * 0.42) * 0.03

      tails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(t * 1.2 + i * 0.8) * 0.1
      })

      look.x += (target.x - look.x) * 0.05
      look.y += (target.y - look.y) * 0.05
      headRig.rotation.y = look.x * 0.34 + Math.sin(t * 0.33) * 0.03
      headRig.rotation.x = look.y * 0.14
      headRig.rotation.z = Math.sin(t * 0.47) * 0.016

      mats.eye.emissiveIntensity = 0.78 + Math.sin(t * 0.85) * 0.1
      eyes.forEach((eye, i) => {
        eye.scale.y = 1 + Math.sin(t * 0.85 + i) * 0.03
      })

      // Arms hang and sway; the blade drifts with them
      arms.forEach(({ shoulder, elbow, side }) => {
        const idle = Math.sin(t * 1.05 + side) * 0.035
        shoulder.rotation.z = side * 0.16 + idle * 0.5
        shoulder.rotation.x = idle
        elbow.rotation.x = -0.1 + idle * 0.4
      })
      katana.rotation.x = 0.18 + Math.sin(t * 0.9) * 0.03

      legs.forEach(({ hip, side }) => {
        hip.rotation.x = Math.sin(t * 0.5 + side * 1.6) * 0.012
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
      mats.fabric.color.copy(cssColor('--samurai-fabric', '#171a21'))
      mats.red.color.copy(cssColor('--samurai-accent', '#c0392b'))
      mats.redDark.color.copy(cssColor('--samurai-accent-dark', '#8e2a1e'))
      mats.metal.color.copy(cssColor('--samurai-armor', '#39414f'))
      mats.metalDark.color.copy(cssColor('--samurai-armor-dark', '#22272f'))
      mats.gold.color.copy(cssColor('--samurai-gold', '#e0a63a'))
      mats.rope.color.copy(cssColor('--samurai-rope', '#b8935a'))
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
