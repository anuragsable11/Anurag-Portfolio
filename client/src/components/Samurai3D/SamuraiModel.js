import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cssColor } from '../../lib/three-utils.js'
import { HEAD_Y, HIP_Y } from './constants.js'
import {
  BACK,
  FRONT,
  LEFT,
  RIGHT,
  arc,
  bladeGeometry,
  clothUV,
  crestGeometry,
  foldCloth,
  mergeCopies,
  meridianStrip,
  pleatCloth,
  shellGeometry,
  sunburstGeometry,
  taperTube,
  indexedCopy,
  tsubaGeometry,
} from './geometry.js'
import { RIG_VERSION } from './rig.js'
import { fillTextureSlots, makeTextureSlots } from './textures.js'

/**
 * The built-in samurai: an original stylised mascot modelled from
 * primitives (see the notes in Samurai3D.jsx for what each part is).
 *
 * createSamuraiModel() sets up the materials at once, so their shaders can
 * compile while the geometry is still being built; build() then puts him
 * together in short slices between frames and resolves with his rig — the
 * joints the animation drives, named after the rig contract in rig.js.
 *
 *   maxAnisotropy  the renderer's texture anisotropy limit
 *   integrated     true on integrated GPUs: slightly coarser curves
 *   breathe        an async slicer (util.createSlicer) awaited between steps
 */
export function createSamuraiModel({ maxAnisotropy, integrated, breathe }) {
  /* ================================================================
     Materials — four shader programs between them
     ================================================================ */
  const maps = makeTextureSlots(maxAnisotropy)
  const geos = new Set()
  const track = (g) => {
    geos.add(g)
    return g
  }
  // A map reused at a different scale shares its pixels and GPU memory.
  const extraMaps = []
  const scaled = (t, repeat) => {
    const c = t.clone()
    c.repeat.set(repeat, repeat)
    c.needsUpdate = true
    extraMaps.push(c)
    return c
  }
  const flat = (k) => new THREE.Vector2(k, k)

  // three.js compiles one program per distinct feature set, and on many
  // GPUs each compile costs hundreds of milliseconds. Every material below
  // is one of three families with identical map slots, so they share
  // programs: vary colours, scalars and which texture fills a slot freely,
  // but keep the slots the same (and keep clearcoat / sheen above zero,
  // since zero drops the feature).

  // The rim: a soft fresnel edge light on everything lit, so his silhouette
  // lifts off a dark page whatever angle the light comes from. One pair of
  // uniform objects is shared by every material — a single write moves them
  // all — and every material carries the same onBeforeCompile, so the three
  // families still share their programs. The effects layer drives it.
  const rim = { color: { value: new THREE.Color(0, 0, 0) }, power: { value: 3 } }
  // Each material also keeps the CSS token its colour comes from, so the
  // theme can recolour it — and so can a GLB exported from this model.
  const withRim = (m, token, fallback) => {
    m.userData.rim = rim
    m.userData.token = token
    m.userData.fallback = fallback
    m.onBeforeCompile = addRim
    return m
  }

  // Urushi lacquer (and waxed leather, and the lacquered wooden saya):
  // pigment over a finely textured base, under a smooth hard clear coat.
  const lacquered = (token, fallback, extra = {}) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: cssColor(token, fallback),
      metalness: 0,
      roughness: 0.36,
      clearcoat: 1,
      clearcoatRoughness: 0.09,
      ior: 1.55,
      envMapIntensity: 0.6,
      map: maps.mottle,
      roughnessMap: maps.grain,
      normalMap: maps.lacquerN,
      normalScale: flat(0.35),
      vertexColors: true,
      ...extra,
    })
    m.userData.wear = -0.42 // worn edges show the darker ground coat
    return withRim(m, token, fallback)
  }

  // Metals: forged iron with hammer marks, dents and scratches; gold; steel.
  const metallic = (token, fallback, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color: cssColor(token, fallback),
      metalness: 0.88,
      map: maps.mottle,
      roughnessMap: maps.ironR,
      normalMap: maps.ironN,
      normalScale: flat(0.55),
      vertexColors: true,
      ...extra,
    })
    m.userData.wear = 0.3 // edges rubbed bright
    return withRim(m, token, fallback)
  }

  // Fabric, silk braid, straw and mail: a woven relief with a soft sheen.
  const woven = (token, fallback, extra = {}) =>
    withRim(
      new THREE.MeshPhysicalMaterial({
        color: cssColor(token, fallback),
        metalness: 0,
        roughness: 0.9,
        sheen: 1,
        sheenRoughness: 0.6,
        map: maps.fabricTone,
        roughnessMap: maps.grain,
        normalMap: maps.weaveN,
        normalScale: flat(0.8),
        ...extra,
      }),
      token,
      fallback
    )

  // The textiles differ as real fibres do. Cotton is matte, its sheen dull
  // and broad; silk is smooth, with a bright, tight sheen, and its woven
  // pattern is picked out in glossier satin floats; braided silk cord sits
  // between the two; leather belongs to the lacquer family above.
  const mats = {
    // Padded cotton: linings, the haidate apron, the quilted undergarment
    // where it shows. Sashiko running stitches over indigo.
    fabric: woven('--samurai-cotton', '#3a4252', {
      roughness: 0.95,
      sheen: 0.35,
      sheenRoughness: 0.85,
      sheenColor: new THREE.Color(0x4a5566),
      map: maps.sashikoC,
    }),
    // The kosode: indigo silk woven with asanoha
    silk: woven('--samurai-silk', '#34405a', {
      roughness: 0.48,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0xd2dcf2),
      map: maps.asanohaC,
      roughnessMap: maps.asanohaR,
      normalScale: flat(0.3),
    }),
    // The hakama: firm striped cotton, pleated
    hakama: woven('--samurai-hakama', '#4a5160', {
      roughness: 0.9,
      sheen: 0.45,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(0x7d8699),
      map: maps.shimaC,
      normalScale: flat(0.75),
    }),
    // The uwa-obi: stiff hakata-woven silk
    obi: woven('--samurai-cloth', '#a8322a', {
      roughness: 0.62,
      sheenRoughness: 0.4,
      sheenColor: new THREE.Color(0xffb4a0),
      map: maps.obiC,
      normalScale: flat(0.4),
    }),
    // Braided silk cord: the agemaki bow
    silkCord: woven('--samurai-cloth', '#a8322a', {
      roughness: 0.5,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0xffb4a0),
      normalMap: maps.braidN,
      normalScale: flat(0.9),
    }),
    rope: woven('--samurai-rope', '#b8935a', {
      roughness: 0.58,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(0xfff0d8),
      normalMap: maps.braidN,
      normalScale: flat(0.9),
    }),
    straw: woven('--samurai-rope', '#b8935a', {
      roughness: 0.92,
      sheen: 0.3,
      normalMap: maps.strawN,
      normalScale: flat(1),
    }),
    kusari: woven('--samurai-armor', '#39414f', {
      metalness: 0.8,
      roughness: 0.5,
      sheen: 0.05,
      normalMap: maps.chainN,
      normalScale: flat(1.3),
      envMapIntensity: 1.2,
    }),
    red: lacquered('--samurai-accent', '#c0392b'),
    redDark: lacquered('--samurai-accent-dark', '#8e2a1e'),
    // Laced lames: the same lacquer over rows of individual scales.
    redLame: lacquered('--samurai-accent', '#c0392b', { normalMap: maps.kozaneN, normalScale: flat(0.72) }),
    redDarkLame: lacquered('--samurai-accent-dark', '#8e2a1e', {
      normalMap: maps.kozaneN,
      normalScale: flat(0.72),
    }),
    bowl: lacquered('--samurai-bowl', '#e8e1d4', {
      roughness: 0.4,
      normalMap: scaled(maps.lacquerN, 6),
      normalScale: flat(0.3),
    }),
    leather: lacquered('--samurai-leather', '#4a3b33', {
      roughness: 0.64,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
      envMapIntensity: 1,
      normalMap: maps.leatherN,
      normalScale: flat(0.8),
    }),
    // The saya: black lacquer over wood, the grain just showing through.
    saya: lacquered('--samurai-saya', '#141418', {
      roughness: 0.5,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.9,
      normalMap: maps.woodN,
      normalScale: flat(0.35),
    }),
    metal: metallic('--samurai-armor', '#39414f', { roughness: 0.44 }),
    metalDark: metallic('--samurai-armor-dark', '#22272f', { roughness: 0.4 }),
    // Polished metals get a stronger reflection than the forged iron.
    gold: metallic('--samurai-gold', '#e0a63a', {
      metalness: 1,
      roughness: 0.26,
      roughnessMap: maps.grain,
      normalScale: flat(0.12),
      envMapIntensity: 1.8,
    }),
    // The blade's colour and roughness both come from the hamon maps.
    steel: metallic('--samurai-steel', '#e9edf4', {
      metalness: 1,
      roughness: 1,
      map: maps.blade,
      roughnessMap: maps.bladeRough,
      normalScale: flat(0.03),
      envMapIntensity: 2.4,
    }),
    // Rides on the metal program: the emissive term is always compiled in.
    eye: metallic('--samurai-eye', '#ffb347', {
      metalness: 0.1,
      roughness: 0.3,
      normalScale: flat(0),
      emissive: cssColor('--samurai-eye', '#ffb347'),
      emissiveIntensity: 0.8,
    }),
  }
  mats.gold.userData.wear = 0.15
  mats.steel.userData.wear = 0
  mats.eye.userData.wear = 0

  // The kabuto and menpō: black urushi flecked with gold leaf. The colour
  // is all in the map (black ground, gold flakes), so the material is white.
  const helmetFinish = (extra) => {
    const m = lacquered('--samurai-helmet-tint', '#ffffff', {
      roughness: 0.34,
      clearcoatRoughness: 0.05,
      envMapIntensity: 0.75,
      map: maps.flakeC,
      roughnessMap: maps.flakeR,
      normalScale: flat(0.25),
      ...extra,
    })
    m.userData.wear = 0.2
    return m
  }
  mats.helmet = helmetFinish()
  // Spheres and tubes carry 0..1 UVs, so they take the flakes at a finer repeat.
  mats.helmetRound = helmetFinish({
    map: scaled(maps.flakeC, 8),
    roughnessMap: scaled(maps.flakeR, 8),
    normalMap: scaled(maps.lacquerN, 6),
  })
  mats.helmetLame = helmetFinish({ normalMap: maps.kozaneN, normalScale: flat(0.72) })
  // The crest: gilt plate, engraved all over.
  mats.crest = metallic('--samurai-gold', '#e0a63a', {
    metalness: 1,
    roughness: 0.3,
    map: maps.engraveC,
    roughnessMap: maps.grain,
    normalMap: maps.engraveN,
    normalScale: flat(0.9),
    envMapIntensity: 1.8,
  })
  mats.crest.userData.wear = 0.1
  // The tsurubashiri-gawa: stencilled indigo leather. Like the kabuto, its
  // colour is all in the map, so the material itself is white.
  mats.stencil = lacquered('--samurai-stencil-tint', '#ffffff', {
    roughness: 0.66,
    clearcoat: 0.2,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.8,
    map: maps.stencilC,
    normalMap: maps.stencilN,
    normalScale: flat(0.6),
  })
  mats.stencil.userData.wear = -0.3
  mats.helmetLacing = woven('--samurai-helmet-lacing', '#232a3d', {
    roughness: 0.6,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0x6b7a99),
    normalMap: maps.braidN,
    normalScale: flat(0.9),
  })
  // Lames swap in the scale-textured lacquer of the same colour.
  const LAME = new Map([
    [mats.red, mats.redLame],
    [mats.redDark, mats.redDarkLame],
  ])
  const glowMat = new THREE.MeshBasicMaterial({
    map: maps.glow,
    color: cssColor('--samurai-eye', '#ffb347'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.5,
  })
  const allMats = [...Object.values(mats), glowMat]
  for (const [name, m] of Object.entries(mats)) m.name = name
  glowMat.name = 'glow'

  const samurai = new THREE.Group()
  // Every part below is placed as it is worn — the katana in the right
  // hand, the daishō on the left hip, the dō hinged under the left arm —
  // with the sword arm on +X. Facing +Z in three.js's right-handed axes, +X
  // is a figure's left, so the whole figure is mirrored once, here, and he
  // is right-handed as a samurai is.
  samurai.scale.x = -1

  const mesh = (geo, material) => {
    const m = new THREE.Mesh(track(geo), material)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  /**
   * A solid curved armour plate. Geometry is built centred on the front and
   * cached by shape, then rotated into place — the six kusazuri panels, both
   * sode and both legs all reuse the same few shells.
   */
  const shellCache = new Map()
  // Segments follow the arc length, so every plate's curve stays smooth
  // with a sub-pixel chord error at the top rung: one segment per 0.03
  // units where a discrete GPU can draw 3×, a little coarser (and a bevel
  // ring fewer) where an integrated one draws every vertex three times.
  const ARC_STEP = integrated ? 0.045 : 0.03
  const BEVEL_SEGS = integrated ? 3 : 4
  const arcSegments = (r, sweep, atLeast = 0) =>
    Math.max(atLeast, Math.min(96, Math.ceil((r * sweep) / ARC_STEP)))
  const plate = (
    rTop,
    rBottom,
    height,
    [start, sweep],
    material,
    thickness = 0.026,
    minSegs = 8,
    uvMode = 'world',
    profile = null
  ) => {
    const segs = arcSegments((rTop + rBottom) / 2, sweep, minSegs)
    const key = [rTop, rBottom, height, sweep, thickness, segs].map((v) => v.toFixed(4)).join() + uvMode
    // A profiled plate is one of a kind: it is not cached.
    let geo = profile ? null : shellCache.get(key)
    if (!geo) {
      geo = track(
        shellGeometry(rTop, rBottom, height, arc(0, sweep), thickness, segs, uvMode, BEVEL_SEGS, profile)
      )
      if (!profile) shellCache.set(key, geo)
    }
    const m = new THREE.Mesh(geo, material)
    m.castShadow = true
    m.receiveShadow = true
    m.rotation.y = start + sweep / 2
    return m
  }

  const STUD = track(new THREE.SphereGeometry(0.026, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2))
  const stud = (parent, x, y, z, rotY = 0, scale = 1) => {
    const s = new THREE.Mesh(STUD, mats.gold)
    s.castShadow = true
    s.position.set(x, y, z)
    s.rotation.set(Math.PI / 2, rotY, 0, 'YXZ')
    s.scale.setScalar(scale)
    parent.add(s)
    return s
  }

  /**
   * A kiku kamon as a gilt fitting: a disc, sixteen petals and a domed
   * heart, lying in the XY plane and facing +Z. `r` is the petals' reach.
   */
  const KIKU_PETAL = track(new THREE.SphereGeometry(1, 10, 6))
  const kikuMon = (r) => {
    const mon = new THREE.Group()
    const disc = mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.78, r * 0.22, 32), mats.gold)
    disc.rotation.x = Math.PI / 2
    mon.add(disc)
    mon.add(
      mesh(
        mergeCopies(
          KIKU_PETAL,
          Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            return new THREE.Matrix4().compose(
              new THREE.Vector3(Math.sin(a) * r * 0.62, Math.cos(a) * r * 0.62, r * 0.12),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a),
              new THREE.Vector3(r * 0.14, r * 0.34, r * 0.1)
            )
          })
        ),
        mats.gold
      )
    )
    const dome = mesh(new THREE.SphereGeometry(r * 0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.gold)
    dome.rotation.x = Math.PI / 2
    dome.position.z = r * 0.12
    mon.add(dome)
    return mon
  }

  /** A row of dome rivets round an arc, `count` of them spread over `sweep`. */
  const RIVET = track(new THREE.SphereGeometry(0.0085, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2))
  const rivetRow = (parent, r, y, [start, sweep], count, material = mats.metalDark, scale = 1) => {
    const up = new THREE.Vector3(0, 1, 0)
    const at = []
    for (let i = 0; i < count; i++) {
      const a = start + (sweep * (i + 0.5)) / count
      const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
      at.push(
        new THREE.Matrix4().compose(
          n.clone().multiplyScalar(r).setY(y),
          new THREE.Quaternion().setFromUnitVectors(up, n),
          new THREE.Vector3(scale, scale, scale)
        )
      )
    }
    parent.add(mesh(mergeCopies(RIVET, at), material))
  }

  /**
   * Draw calls, not triangles, are what this scene costs on integrated
   * GPUs: every plate, stud and cord is its own mesh, and each is drawn
   * three times a frame (shadow map, normals for AO, colour). Once a rigid
   * part is built, its static meshes are baked into one mesh per material.
   * Nodes listed in `keep` (and everything under them) still animate on
   * their own, so they are left alone.
   */
  const bake = async (root, keep = []) => {
    root.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const byMaterial = new Map()
    const sources = []
    root.traverse((o) => {
      if (!o.isMesh || keep.includes(o)) return
      for (let p = o.parent; p && p !== root; p = p.parent) if (keep.includes(p)) return
      sources.push(o)
    })
    for (const o of sources) {
      const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)
      // Kept indexed: every part's vertices stay shared (see indexedCopy).
      const g = indexedCopy(o.geometry)
      if (o.material.vertexColors) paintWear(g, o.material.userData.wear || 0, o.matrixWorld)
      g.deleteAttribute('wear')
      g.applyMatrix4(local)
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, [])
      byMaterial.get(o.material).push(g)
      await breathe()
    }
    const merged = []
    for (const [material, parts] of byMaterial) {
      const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts)
      if (parts.length > 1) parts.forEach((g) => g.dispose())
      if (!geo) {
        // Incompatible attributes: leave this part as separate meshes.
        merged.forEach((m) => m.geometry.dispose())
        return
      }
      merged.push(mesh(geo, material))
      await breathe()
    }
    sources.forEach((o) => o.parent.remove(o))
    merged.forEach((m) => root.add(m))
  }

  /**
   * Weathering, as vertex colour: plate edges and corners rub through the
   * lacquer (or polish the iron bright), and dust settles on whatever is
   * close to the ground. Positions are taken in the standing pose.
   */
  const DUST = new THREE.Color(0.8, 0.74, 0.64)
  const wearPoint = new THREE.Vector3()
  const paintWear = (g, amount, world) => {
    const pos = g.attributes.position
    const wear = g.attributes.wear
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      wearPoint.fromBufferAttribute(pos, i).applyMatrix4(world)
      const dust = THREE.MathUtils.smoothstep(0.6 - wearPoint.y, 0, 0.6) * 0.45
      const k = 1 + amount * (wear ? wear.getX(i) : 0)
      colors[i * 3] = k * (1 + (DUST.r - 1) * dust)
      colors[i * 3 + 1] = k * (1 + (DUST.g - 1) * dust)
      colors[i * 3 + 2] = k * (1 + (DUST.b - 1) * dust)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }

  /* ---- Silk lacing: every cord of a group merged into one mesh ---- */
  // Each segment is [from, to, outwardNormal]. The braid is flattened
  // against the plate it crosses, so it reads as lacing, not as dowels.
  const CORD = track(new THREE.CylinderGeometry(0.0085, 0.0085, 1, 8, 1))
  const lace = (parent, segments, material = mats.rope) => {
    if (!segments.length) return
    const x = new THREE.Vector3()
    const y = new THREE.Vector3()
    const z = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const size = new THREE.Vector3()
    const matrices = segments.map(([a, b, n]) => {
      y.subVectors(b, a)
      const len = y.length()
      y.normalize()
      z.copy(n).addScaledVector(y, -n.dot(y)).normalize()
      x.crossVectors(y, z).normalize()
      mid.addVectors(a, b).multiplyScalar(0.5)
      const m = new THREE.Matrix4().makeBasis(x, y, z)
      m.setPosition(mid)
      return m.scale(size.set(1.5, len, 0.55))
    })
    parent.add(mesh(mergeCopies(CORD, matrices), material))
  }

  /**
   * Rows of lames laced together with pairs of silk braid — how sode,
   * kusazuri and shikoro are really built. The radius grows linearly
   * downward by `flare`, so the rows open out like a skirt. The bottom
   * lame is finished with hishinui cross-knots. Behind the rows runs one
   * continuous lining shell, so the gaps between lames show dark cloth,
   * never daylight.
   */
  const lamellar = async (
    parent,
    {
      rows,
      rowH,
      gap,
      rTop,
      flare,
      span,
      y = 0,
      material,
      trim,
      topTrim,
      hang = 0,
      cordsPer = 3,
      thickness = 0.024,
      cross = true,
      lacing = mats.rope,
      lining = mats.fabric,
    }
  ) => {
    const group = new THREE.Group()
    group.position.y = y
    parent.add(group)

    const rAt = (yy) => rTop - flare * yy
    if (lining) {
      const depth = rows * rowH + (rows - 1) * gap
      const back = thickness + 0.005
      const liner = plate(
        rAt(0.012) - back,
        rAt(-depth) - back,
        depth + 0.012,
        [span[0] + 0.02, span[1] - 0.04],
        lining,
        0.012
      )
      liner.position.y = (0.012 - depth) / 2
      group.add(liner)
    }
    const cordAt = (a, yy) => {
      const r = rAt(yy) + thickness * 0.32 + 0.003
      return new THREE.Vector3(Math.sin(a) * r, yy, Math.cos(a) * r)
    }
    const normalAt = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
    const [start, sweep] = span
    const segments = []
    const pairs = (yA, yB) => {
      for (let k = 0; k < cordsPer; k++) {
        const a = start + (sweep * (k + 0.5)) / cordsPer
        const spread = 0.02 / rAt(yA)
        for (const o of [-spread, spread]) {
          segments.push([cordAt(a + o, yA), cordAt(a + o, yB), normalAt(a + o)])
        }
      }
    }

    let bottom = 0
    for (let i = 0; i < rows; i++) {
      const top = -i * (rowH + gap)
      bottom = top - rowH
      const mat = Array.isArray(material) ? material[i % material.length] : material
      const lame = plate(rAt(top), rAt(bottom), rowH, span, LAME.get(mat) || mat, thickness, 8, 'lame')
      lame.position.y = top - rowH / 2
      group.add(lame)
      if (i < rows - 1) pairs(bottom + rowH * 0.3, bottom - gap - rowH * 0.3)
      await breathe()
    }
    if (hang) pairs(hang, -rowH * 0.3)
    if (cross) {
      for (let k = 0; k < cordsPer; k++) {
        const a = start + (sweep * (k + 0.5)) / cordsPer
        const o = 0.03 / rAt(bottom)
        const n = normalAt(a)
        const hi = bottom + rowH * 0.56
        const lo = bottom + rowH * 0.12
        segments.push(
          [cordAt(a - o, hi), cordAt(a + o, lo), n],
          [cordAt(a + o, hi), cordAt(a - o, lo), n]
        )
      }
    }
    lace(group, segments, lacing)
    await breathe()

    if (trim) {
      const edge = plate(
        rAt(bottom + 0.018) + 0.006,
        rAt(bottom) + 0.006,
        0.018,
        span,
        trim,
        thickness + 0.012
      )
      edge.position.y = bottom + 0.009
      group.add(edge)
    }
    if (topTrim) {
      const edge = plate(rAt(0) + 0.006, rAt(-0.018) + 0.006, 0.018, span, topTrim, thickness + 0.012)
      edge.position.y = -0.009
      group.add(edge)
    }
    return group
  }

  /* ================================================================
     The model — built in slices between frames (see breathe above)
     ================================================================ */
  // Everything the animation drives, filled in by buildModel.
  let legs = []
  let arms = []
  let panels = []
  let eyes = []
  let glows = []
  let tails = []
  let body, torso, cuirass, skirt, headRig, helmet, katana, saya, sayaStand, sayaSeated
  let crest, agemaki, eyeLight
  // The wakizashi's hilt, from guard to pommel, in the scabbard's frame.
  let wakizashiHilt = null

  const buildModel = async () => {
    /* ================================================================
       Legs — fabric underneath, laced thigh lames, splinted mail shins.
       Hip, knee and ankle each bend, so he can kneel into seiza.
       ================================================================ */
    for (const side of [-1, 1]) {
      const hip = new THREE.Group()
      hip.position.set(side * 0.32, HIP_Y, 0)
      // Splay (Y) is applied outside the lift (X), so a raised thigh still
      // swings out sideways rather than twisting.
      hip.rotation.order = 'YXZ'
      samurai.add(hip)

      // Hakama: striped cotton trousers, knife-pleated, gathered where they
      // are tucked into the suneate below the knee
      const thigh = mesh(
        clothUV(
          pleatCloth(new THREE.CylinderGeometry(0.176, 0.162, 0.46, 80, 16), 0.46, {
            pleats: 10,
            depth: 0.075,
            rings: [
              [0.1, 0.03, 0.08],
              [0.22, -0.02, 0.06],
            ],
            creases: 0.02,
            seed: side + 3,
          }),
          0.17,
          0.46,
          3
        ),
        mats.hakama
      )
      thigh.position.y = -0.25
      hip.add(thigh)

      // Kawara-haidate: a cloth apron over the front and outside of the
      // thigh, faced with small iron tiles sewn on in staggered rows like a
      // roof, and bound along its hem with leather.
      {
        const H_TOP = -0.05
        const H_BOT = -0.45
        const center = side * 0.25
        const apronSpan = arc(center, Math.PI * 0.72)
        const apronR = (y) => 0.19 + (0.187 - 0.19) * ((H_TOP - y) / (H_TOP - H_BOT))
        const apron = plate(apronR(H_TOP), apronR(H_BOT), H_TOP - H_BOT, apronSpan, mats.fabric, 0.008)
        apron.position.y = (H_TOP + H_BOT) / 2
        hip.add(apron)
        const hem = plate(apronR(H_BOT) + 0.003, apronR(H_BOT) + 0.003, 0.022, apronSpan, mats.leather, 0.012)
        hem.position.y = H_BOT + 0.011
        hip.add(hem)

        const ROWS = 5
        const TILE_H = 0.058
        const TILE_GAP = 0.012
        const STEP = 0.4
        for (let row = 0; row < ROWS; row++) {
          const top = H_TOP - 0.018 - row * (TILE_H + TILE_GAP)
          const r0 = apronR(top) + 0.014
          const r1 = apronR(top - TILE_H) + 0.014
          const odd = row % 2
          const count = odd ? 4 : 5
          const first = center - ((count - 1) * STEP) / 2
          for (let c = 0; c < count; c++) {
            const tile = plate(r0, r1, TILE_H, arc(first + c * STEP, 0.34), mats.metal, 0.012, 2)
            tile.position.y = top - TILE_H / 2
            hip.add(tile)
          }
          // A knot of thread at the top of each tile, where it is sewn on
          rivetRow(hip, r0 + 0.001, top - 0.012, [first - STEP / 2, count * STEP], count, mats.rope, 0.8)
        }
      }

      const knee = new THREE.Group()
      knee.position.y = -0.5
      hip.add(knee)

      // The joint itself, so the bend never opens a gap behind the cop
      knee.add(mesh(new THREE.SphereGeometry(0.15, 24, 16), mats.hakama))

      const kneeCop = mesh(new THREE.SphereGeometry(0.15, 36, 24), mats.red)
      kneeCop.position.set(0, 0, 0.06)
      kneeCop.scale.z = 0.8
      knee.add(kneeCop)

      const kneeTrim = mesh(new THREE.TorusGeometry(0.14, 0.016, 12, 64), mats.gold)
      kneeTrim.position.set(0, 0, 0.13)
      knee.add(kneeTrim)
      stud(knee, 0, 0, 0.175, 0, 0.8)

      // The shin is sleeved in kusari (mail) under the splints
      const shin = mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.4, 40), mats.kusari)
      shin.position.y = -0.27
      knee.add(shin)

      // Suneate: five separate iron splints, mail showing between them
      ;[-2, -1, 0, 1, 2].forEach((k) => {
        const splint = plate(0.168, 0.176, 0.32, arc(FRONT + k * 0.44, 0.32), mats.metal, 0.02)
        splint.position.y = -0.29
        knee.add(splint)
      })

      const shinTrim = plate(0.174, 0.176, 0.028, arc(FRONT, Math.PI * 0.9), mats.gold, 0.014)
      shinTrim.position.y = -0.12
      knee.add(shinTrim)
      const shinCuff = plate(0.158, 0.16, 0.024, arc(FRONT, Math.PI * 0.9), mats.leather, 0.014)
      shinCuff.position.y = -0.455
      knee.add(shinCuff)

      // Cords binding the splints on, knotted at the back of the calf
      ;[-0.16, -0.41].forEach((yy) => {
        const tie = mesh(new THREE.TorusGeometry(0.168, 0.008, 6, 48), mats.rope)
        tie.position.set(0, yy, 0.0135)
        tie.rotation.x = Math.PI / 2
        knee.add(tie)
        const knot = mesh(new THREE.SphereGeometry(0.02, 10, 8), mats.rope)
        knot.position.set(side * 0.07, yy, -0.14)
        knot.scale.set(1.3, 0.8, 1)
        knee.add(knot)
      })

      const ankle = new THREE.Group()
      ankle.position.y = -0.5
      knee.add(ankle)

      // Kegutsu: a leather boot with a rounded toe over a flat vamp, a rolled
      // cuff, two instep straps and a plaited straw sole.
      const foot = mesh(new THREE.SphereGeometry(0.2, 36, 22), mats.leather)
      foot.position.set(0, -0.01, 0.1)
      foot.scale.set(0.95, 0.5, 1.45)
      ankle.add(foot)

      const vamp = mesh(new RoundedBoxGeometry(0.3, 0.1, 0.46, 4, 0.045), mats.leather)
      vamp.position.set(0, -0.06, 0.1)
      ankle.add(vamp)

      const cuff = mesh(new THREE.TorusGeometry(0.15, 0.032, 14, 48), mats.leather)
      cuff.position.y = 0.04
      cuff.rotation.x = Math.PI / 2
      ankle.add(cuff)

      const sole = mesh(new RoundedBoxGeometry(0.32, 0.04, 0.48, 4, 0.018), mats.straw)
      sole.position.set(0, -0.1, 0.1)
      ankle.add(sole)

      ;[
        [0.15, 0.07, 0.3],
        [0.27, 0.035, 0.55],
      ].forEach(([z, yy, tilt]) => {
        const strap = mesh(new RoundedBoxGeometry(0.34, 0.045, 0.055, 3, 0.02), mats.leather)
        strap.position.set(0, yy, z)
        strap.rotation.x = tilt
        ankle.add(strap)
        // A small brass buckle on the outside of each strap
        const buckle = mesh(new THREE.TorusGeometry(0.02, 0.0045, 6, 4), mats.gold)
        buckle.position.set(side * 0.15, yy + 0.012, z)
        buckle.rotation.set(tilt - Math.PI / 2, 0, Math.PI / 4)
        ankle.add(buckle)
      })

      // Welt stitching round the boot, just above the sole
      const stitch = new THREE.BoxGeometry(0.006, 0.006, 0.017)
      const stitches = Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2
        return new THREE.Matrix4().compose(
          new THREE.Vector3(Math.sin(a) * 0.158, -0.075, 0.1 + Math.cos(a) * 0.238),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
          new THREE.Vector3(1, 1, 1)
        )
      })
      ankle.add(mesh(mergeCopies(stitch, stitches), mats.rope))
      stitch.dispose()

      legs.push({ hip, knee, ankle, side })
      await breathe()
    }

    /* ================================================================
       Body — fabric torso, a laced dō, separated kusazuri
       ================================================================ */
    body = new THREE.Group()
    body.position.y = HIP_Y
    samurai.add(body)

    // The undergarment. Every armour piece sits on top of this with a gap.
    torso = mesh(new RoundedBoxGeometry(0.72, 0.84, 0.56, 8, 0.22), mats.silk)
    torso.position.y = 0.46
    body.add(torso)

    // The hips: a padded block under the sash that joins the torso to the
    // tops of both thighs, so the skirt panels hang over cloth, not air.
    const pelvis = mesh(new RoundedBoxGeometry(0.72, 0.36, 0.5, 6, 0.16), mats.hakama)
    pelvis.position.y = -0.09
    body.add(pelvis)

    const neck = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 40), mats.silk)
    neck.position.y = 0.93
    body.add(neck)

    // Dō: a two-piece (ni-mai) dō, hinged under the left arm and tied under
    // the right. Each half is built the tōsei-gusoku way — the muna-ita on
    // top, then horizontal plates riveted one over the next (okegawa), then
    // laced lames (mogami) to the waist — and the front carries the
    // stencilled leather tsurubashiri-gawa of an ō-yoroi.
    cuirass = new THREE.Group()
    cuirass.position.y = 0.52
    cuirass.scale.z = 0.74
    body.add(cuirass)

    for (const [center, sweep, cords] of [
      [FRONT, Math.PI * 0.88, 5],
      [BACK, Math.PI * 0.72, 4],
    ]) {
      // Three plates from the top down. Each lower plate's upper edge tucks
      // under the plate above; a line of rivets holds every lap.
      const span = arc(center, sweep)
      for (const [yTop, yBot, rTop, rBot, mat] of [
        [0.26, 0.19, 0.42, 0.424, mats.red],
        [0.2, 0.125, 0.418, 0.43, mats.redDark],
        [0.135, 0.06, 0.424, 0.436, mats.red],
      ]) {
        const band = plate(rTop, rBot, yTop - yBot, span, mat, 0.026)
        band.position.y = (yTop + yBot) / 2
        cuirass.add(band)
        if (yBot > 0.1) rivetRow(cuirass, rBot + 0.002, yBot + 0.011, span, 11)
      }

      const rim = plate(0.43, 0.43, 0.022, arc(center, sweep), mats.gold, 0.04)
      rim.position.y = 0.265
      cuirass.add(rim)

      await lamellar(cuirass, {
        rows: 4,
        rowH: 0.068,
        gap: 0.02,
        rTop: 0.44,
        flare: 0.07,
        span: arc(center, sweep + 0.06),
        y: 0.038,
        material: [mats.red, mats.red, mats.redDark, mats.red],
        hang: 0.05,
        cordsPer: cords,
      })
    }

    // Waki-ita: iron plates under the arms, tucked beneath the chest halves
    ;[LEFT, RIGHT].forEach((c) => {
      const flank = plate(0.408, 0.42, 0.17, arc(c, 0.62), mats.metal, 0.024)
      flank.position.y = 0.17
      cuirass.add(flank)
    })

    // A row of rivets under the gilt rim of each muna-ita, seated on the plate
    rivetRow(cuirass, 0.422, 0.244, arc(FRONT, Math.PI * 0.88), 9)
    rivetRow(cuirass, 0.422, 0.244, arc(BACK, Math.PI * 0.72), 9)
    // And across the right waki-ita, above the ties (the hinge covers the left)
    rivetRow(cuirass, 0.419, 0.225, arc(RIGHT, 0.5), 3)

    // The house's kamon, a gilt kiku, riveted to the middle chest plate
    const kamon = kikuMon(0.058)
    kamon.position.set(0, 0.19, 0.438)
    cuirass.add(kamon)

    // Tsurubashiri-gawa: stencilled leather laced over the front of the dō
    // below the chest plates, so a bowstring would never catch on the
    // lacing. It is edged all round with a gilt fukurin and fixed at the
    // corners with gilt studs.
    const TSURU_TOP = 0.118
    const TSURU_BOT = -0.29
    const TSURU_H = TSURU_TOP - TSURU_BOT
    const TSURU_SPAN = 1.15
    const tsuruR = [0.474, 0.497]
    const tsuru = plate(tsuruR[0], tsuruR[1], TSURU_H, arc(FRONT, TSURU_SPAN), mats.stencil, 0.012)
    tsuru.position.y = (TSURU_TOP + TSURU_BOT) / 2
    cuirass.add(tsuru)
    for (const [y, r] of [
      [TSURU_TOP - 0.008, tsuruR[0] + 0.004],
      [TSURU_BOT + 0.008, tsuruR[1] + 0.004],
    ]) {
      const edge = plate(r, r, 0.016, arc(FRONT, TSURU_SPAN + 0.02), mats.gold, 0.02)
      edge.position.y = y
      cuirass.add(edge)
    }
    for (const side of [-1, 1]) {
      const edge = plate(
        tsuruR[0] + 0.004,
        tsuruR[1] + 0.004,
        TSURU_H,
        arc((side * TSURU_SPAN) / 2, 0.034),
        mats.gold,
        0.02,
        2
      )
      edge.position.y = tsuru.position.y
      cuirass.add(edge)
      for (const [y, r] of [
        [TSURU_TOP - 0.008, tsuruR[0] + 0.02],
        [TSURU_BOT + 0.008, tsuruR[1] + 0.02],
      ]) {
        const a = (side * TSURU_SPAN) / 2
        stud(cuirass, Math.sin(a) * r, y, Math.cos(a) * r, a, 0.6)
      }
    }

    // Sendan-no-ita (the wearer's right) and kyūbi-no-ita (left): the two
    // small guards hanging from the shoulder straps over the chest. As on an
    // ō-yoroi, the sendan-no-ita is three laced lames that can flex, and
    // the kyūbi-no-ita a single solid plate with gilt fittings.
    await lamellar(cuirass, {
      rows: 3,
      rowH: 0.048,
      gap: 0.012,
      rTop: 0.464,
      flare: 0.03,
      span: arc(0.6, 0.28),
      y: 0.33,
      material: [mats.red, mats.redDark, mats.red],
      trim: mats.gold,
      hang: 0.03,
      cordsPer: 1,
      thickness: 0.018,
      cross: false,
    })
    {
      const kyubi = new THREE.Group()
      cuirass.add(kyubi)
      const KY_TOP = 0.33
      const KY_H = 0.17
      const span = arc(-0.6, 0.26)
      const board = plate(0.466, 0.471, KY_H, span, mats.red, 0.02)
      board.position.y = KY_TOP - KY_H / 2
      kyubi.add(board)
      for (const y of [KY_TOP - 0.009, KY_TOP - KY_H + 0.009]) {
        const edge = plate(0.472, 0.473, 0.018, [span[0] - 0.01, span[1] + 0.02], mats.gold, 0.03)
        edge.position.y = y
        kyubi.add(edge)
      }
      const flower = kikuMon(0.026)
      flower.position.set(Math.sin(-0.6) * 0.476, KY_TOP - KY_H / 2, Math.cos(-0.6) * 0.476)
      flower.rotation.y = -0.6
      kyubi.add(flower)
      rivetRow(kyubi, 0.472, KY_TOP - 0.03, [span[0] + 0.03, span[1] - 0.06], 2, mats.gold, 1.2)
    }

    // Chōtsugai: the gilt hinge joining the two halves under the left arm —
    // three knuckles on a pin, each leaf riveted to its half.
    {
      const hinge = new THREE.Group()
      hinge.position.set(-0.436, 0.16, 0)
      cuirass.add(hinge)
      const pin = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 10), mats.gold)
      hinge.add(pin)
      for (let i = 0; i < 3; i++) {
        const knuckle = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 14), mats.gold)
        knuckle.position.y = -0.066 + i * 0.066
        hinge.add(knuckle)
        const leaf = mesh(new RoundedBoxGeometry(0.012, 0.046, 0.07, 2, 0.004), mats.gold)
        leaf.position.set(0.002, knuckle.position.y, (i % 2 ? -1 : 1) * 0.045)
        hinge.add(leaf)
        stud(hinge, -0.006, knuckle.position.y, (i % 2 ? -1 : 1) * 0.06, -Math.PI / 2, 0.35)
      }
    }

    // Takahimo: the cords that close the dō under the right arm, drawn
    // through a pair of rings and tied in a flat bow.
    {
      const tie = new THREE.Group()
      tie.position.set(0.442, 0.12, 0)
      tie.rotation.y = Math.PI / 2
      cuirass.add(tie)
      for (const z of [-0.05, 0.05]) {
        const ring = mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 20), mats.gold)
        ring.position.set(z, 0.03, 0)
        tie.add(ring)
      }
      const knot = mesh(new THREE.SphereGeometry(0.018, 12, 10), mats.rope)
      knot.scale.set(1.3, 0.9, 0.7)
      tie.add(knot)
      for (const s of [-1, 1]) {
        const loop = mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 24), mats.rope)
        loop.position.set(s * 0.03, 0.004, 0.004)
        loop.rotation.z = s * 0.5
        loop.scale.set(1, 0.7, 0.6)
        tie.add(loop)
        const end = mesh(new RoundedBoxGeometry(0.012, 0.09, 0.008, 2, 0.004), mats.rope)
        end.position.set(s * 0.014, -0.05, 0.004)
        end.rotation.z = s * 0.18
        tie.add(end)
      }
    }
    await breathe()

    // Watagami: stitched leather shoulder straps tying the dō on. Each runs
    // up the chest, over the shoulder and down the back; the front end is
    // fastened with a brass buckle.
    const stitch = new THREE.BoxGeometry(0.005, 0.014, 0.006)
    const stitchRows = (count, step, z) => {
      const rows = []
      for (let i = 0; i < count; i++) {
        for (const x of [-0.029, 0.029]) {
          rows.push(new THREE.Matrix4().makeTranslation(x, (-(count - 1) / 2 + i) * step, z))
        }
      }
      return rows
    }
    ;[-1, 1].forEach((side) => {
      for (const front of [1, -1]) {
        const strapRig = new THREE.Group()
        strapRig.position.set(side * 0.24, 0.82, front * 0.19)
        strapRig.rotation.z = side * 0.25
        body.add(strapRig)
        strapRig.add(mesh(new RoundedBoxGeometry(0.075, 0.34, 0.026, 3, 0.01), mats.leather))
        strapRig.add(mesh(mergeCopies(stitch, stitchRows(12, 0.027, front * 0.013)), mats.rope))
        if (front < 0) continue

        const buckle = mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 4), mats.gold)
        buckle.rotation.z = Math.PI / 4
        buckle.scale.set(1.3, 1, 1)
        buckle.position.set(0, -0.05, 0.017)
        strapRig.add(buckle)
        const tongue = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), mats.gold)
        tongue.position.set(0, -0.05, 0.021)
        strapRig.add(tongue)
      }
      // Over the shoulder, lying on the torso's rounded corner
      const over = new THREE.Group()
      over.position.set(side * 0.245, 0.868, 0)
      over.rotation.z = -side * 0.47
      body.add(over)
      over.add(mesh(new RoundedBoxGeometry(0.075, 0.026, 0.4, 3, 0.01), mats.leather))
      const lengthwise = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
      const overStitches = []
      for (let i = 0; i < 13; i++) {
        for (const x of [-0.029, 0.029]) {
          overStitches.push(
            new THREE.Matrix4().compose(new THREE.Vector3(x, 0.013, (i - 6) * 0.028), lengthwise, new THREE.Vector3(1, 1, 1))
          )
        }
      }
      over.add(mesh(mergeCopies(stitch, overStitches), mats.rope))

      // Kohire: the small lacquered guard at the end of each watagami,
      // capping the point of the shoulder above the sode, gilt-edged along
      // its outer rim. The sode hangs from it by the sode-tsuke-no-o, tied
      // in a flat knot on top. Built as a shell round a front-to-back axis.
      const kohire = new THREE.Group()
      kohire.position.set(side * 0.36, 0.72, 0)
      body.add(kohire)
      const KO_R = 0.15
      const KO_A = side * (Math.PI - 0.72)
      const shell = plate(KO_R, KO_R, 0.22, arc(KO_A, 0.56), mats.red, 0.016)
      shell.rotation.x = Math.PI / 2
      kohire.add(shell)
      const rim = plate(KO_R + 0.004, KO_R + 0.004, 0.224, arc(KO_A - side * 0.28, 0.05), mats.gold, 0.022, 2)
      rim.rotation.x = Math.PI / 2
      kohire.add(rim)
      const onKohire = (a, lift) => new THREE.Vector3(Math.sin(a), -Math.cos(a), 0).multiplyScalar(KO_R + lift)
      for (const z of [-0.07, 0.07]) {
        const at = onKohire(KO_A - side * 0.16, 0.002)
        const s = stud(kohire, at.x, at.y, z, 0, 0.4)
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize())
      }
      const knotAt = onKohire(KO_A + side * 0.12, 0.012)
      const cordKnot = mesh(new THREE.SphereGeometry(0.02, 12, 10), mats.rope)
      cordKnot.position.copy(knotAt)
      cordKnot.scale.set(1.4, 0.7, 1)
      kohire.add(cordKnot)
      for (const z of [-1, 1]) {
        const loop = mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 18), mats.rope)
        loop.position.copy(knotAt).setZ(z * 0.024)
        loop.rotation.set(0, Math.PI / 2, z * 0.5)
        kohire.add(loop)
      }
    })
    stitch.dispose()

    // Machi-uke: the lacquered cup at the small of the back that the foot of
    // a sashimono banner pole would stand in, on a riveted bracket.
    {
      const MZ = -0.39
      const cup = mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.05, 20, 1, true), mats.saya)
      cup.position.set(0, 0.235, MZ)
      body.add(cup)
      const lip = mesh(new THREE.TorusGeometry(0.032, 0.005, 8, 24), mats.gold)
      lip.position.set(0, 0.26, MZ)
      lip.rotation.x = Math.PI / 2
      body.add(lip)
      const base = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 20), mats.saya)
      base.position.set(0, 0.211, MZ)
      body.add(base)
      const bracket = mesh(new RoundedBoxGeometry(0.1, 0.04, 0.03, 2, 0.006), mats.metalDark)
      bracket.position.set(0, 0.235, -0.358)
      body.add(bracket)
      ;[-0.037, 0.037].forEach((x) => stud(body, x, 0.235, -0.373, Math.PI, 0.35))
    }

    // Gattari: the bracket on the upper back plate that a banner pole would
    // seat in, and beneath it the ring (agemaki-no-kan) the bow hangs from.
    const gattari = mesh(new RoundedBoxGeometry(0.11, 0.05, 0.022, 3, 0.008), mats.metalDark)
    gattari.position.set(0, 0.755, -0.33)
    body.add(gattari)
    const gattariTube = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 16), mats.gold)
    gattariTube.position.set(0, 0.76, -0.352)
    body.add(gattariTube)
    ;[-0.04, 0.04].forEach((x) => stud(body, x, 0.755, -0.342, Math.PI, 0.45))
    const kan = mesh(new THREE.TorusGeometry(0.024, 0.006, 8, 24), mats.gold)
    kan.position.set(0, 0.715, -0.345)
    body.add(kan)

    // Agemaki: the large decorative silk bow on the back of the dō. It
    // hangs from the ring, so it swings on its own.
    agemaki = new THREE.Group()
    agemaki.position.set(0, 0.66, -0.36)
    body.add(agemaki)
    const loopGeo = track(new THREE.TorusGeometry(0.075, 0.021, 14, 48))
    ;[-1, 1].forEach((s) => {
      const loop = new THREE.Mesh(loopGeo, mats.silkCord)
      loop.castShadow = loop.receiveShadow = true
      loop.position.set(s * 0.078, 0.03, 0)
      loop.rotation.set(0.25, 0, s * 0.6)
      agemaki.add(loop)

      const tail = mesh(new RoundedBoxGeometry(0.042, 0.32, 0.018, 3, 0.012), mats.silkCord)
      tail.position.set(s * 0.045, -0.18, 0.004)
      tail.rotation.z = s * 0.1
      agemaki.add(tail)
    })
    const agemakiKnot = mesh(new THREE.SphereGeometry(0.048, 24, 16), mats.silkCord)
    agemakiKnot.scale.set(1.3, 0.9, 0.8)
    agemaki.add(agemakiKnot)

    // Uwa-obi: the hakata-woven silk belt over the dō, knotted on the left hip
    const sash = mesh(
      foldCloth(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 64, 8), 0.15, {
        rings: [
          [0.3, 0.025, 0.08],
          [0.72, 0.02, 0.06],
        ],
        creases: 0.015,
        seed: 2,
      }),
      mats.obi
    )
    sash.position.y = 0.1
    sash.scale.z = 0.74
    body.add(sash)

    const sashKnot = new THREE.Group()
    sashKnot.position.set(-0.31, 0.09, 0.23)
    sashKnot.rotation.y = -0.8
    body.add(sashKnot)
    const knotCore = mesh(new THREE.SphereGeometry(0.06, 24, 16), mats.obi)
    knotCore.scale.set(1.3, 0.85, 0.9)
    sashKnot.add(knotCore)
    ;[-1, 1].forEach((s) => {
      const loop = new THREE.Mesh(track(new THREE.TorusGeometry(0.06, 0.024, 12, 40)), mats.obi)
      loop.castShadow = loop.receiveShadow = true
      loop.position.set(s * 0.07, 0.02, 0)
      loop.rotation.set(0.35, 0, s * 0.7)
      sashKnot.add(loop)
    })
    ;[0.03, -0.045].forEach((x, i) => {
      const tail = mesh(new RoundedBoxGeometry(0.08, 0.3, 0.03, 4, 0.014), mats.obi)
      tail.position.set(x, -0.19 - i * 0.03, 0.02 - i * 0.03)
      tail.rotation.z = 0.12 - i * 0.3
      sashKnot.add(tail)
    })

    // Saya: the empty scabbard, lacquered wood, thrust through the obi on
    // the left hip and angled back. It has a horn mouth (koiguchi), a knob
    // (kurikata) for the silk cord (sageo) looped over the obi, and an iron
    // end cap (kojiri). Kneeling, it swings up to clear the floor.
    saya = new THREE.Group()
    saya.position.set(-0.42, 0.16, 0.2)
    body.add(saya)
    const SAYA_LEN = 1.18
    const DOWN = new THREE.Vector3(0, -1, 0)
    sayaStand = new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(-0.22, -0.42, -0.88).normalize())
    sayaSeated = new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(-0.2, -0.12, -0.97).normalize())
    saya.quaternion.copy(sayaStand)
    const sayaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.012, -SAYA_LEN * 0.5, 0),
      new THREE.Vector3(0.045, -SAYA_LEN, 0),
    ])
    const sheath = new THREE.TubeGeometry(sayaCurve, 40, 0.036, 14, false)
    sheath.scale(0.62, 1, 1)
    saya.add(mesh(sheath, mats.saya))
    const koiguchi = mesh(new THREE.CylinderGeometry(0.038, 0.037, 0.04, 18), mats.metalDark)
    koiguchi.scale.set(0.62, 1, 1)
    koiguchi.position.y = -0.012
    saya.add(koiguchi)
    const kurikata = mesh(new RoundedBoxGeometry(0.018, 0.05, 0.03, 2, 0.007), mats.saya)
    kurikata.position.set(0.001, -0.15, 0.036)
    saya.add(kurikata)
    const kojiri = mesh(new THREE.SphereGeometry(0.036, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.metalDark)
    kojiri.position.copy(sayaCurve.getPointAt(1))
    kojiri.scale.set(0.62, 1.4, 1)
    saya.add(kojiri)
    // The cord, authored in body space and carried into the saya's frame.
    saya.updateMatrix()
    const toSaya = saya.matrix.clone().invert()
    const knob = kurikata.position.clone().applyMatrix4(saya.matrix)
    const sageoCurve = new THREE.CatmullRomCurve3(
      [
        knob,
        knob.clone().add(new THREE.Vector3(0.05, -0.12, 0.05)),
        new THREE.Vector3(-0.3, -0.02, 0.26),
        new THREE.Vector3(-0.2, 0.06, 0.29),
        new THREE.Vector3(-0.12, 0.14, 0.29),
      ].map((p) => p.applyMatrix4(toSaya))
    )
    saya.add(mesh(new THREE.TubeGeometry(sageoCurve, 36, 0.009, 6), mats.rope))

    // Wakizashi: the short sword of the daishō, sheathed and thrust through
    // the obi on the inside of the katana's scabbard, its hilt forward. It
    // is mounted to match the katana — the same lacquer, wrap and fittings,
    // a smaller guard. Built in the scabbard's frame (+Y back up to its
    // mouth), so it swings with it when he kneels.
    {
      const waki = new THREE.Group()
      waki.position.set(0.045, 0.05, 0.05)
      waki.rotation.set(0.1, 0, -0.03)
      saya.add(waki)
      const LEN = 0.8
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.008, -LEN * 0.5, 0),
        new THREE.Vector3(0.03, -LEN, 0),
      ])
      const sheath = new THREE.TubeGeometry(curve, 20, 0.03, 10, false)
      sheath.scale(0.62, 1, 1)
      waki.add(mesh(sheath, mats.saya))
      const mouth = mesh(new THREE.CylinderGeometry(0.032, 0.031, 0.034, 16), mats.metalDark)
      mouth.scale.set(0.62, 1, 1)
      mouth.position.y = -0.01
      waki.add(mouth)
      const knob = mesh(new RoundedBoxGeometry(0.016, 0.042, 0.026, 2, 0.006), mats.saya)
      knob.position.set(0.001, -0.12, 0.03)
      waki.add(knob)
      const cap = mesh(new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.metalDark)
      cap.position.copy(curve.getPointAt(1))
      cap.scale.set(0.62, 1.4, 1)
      waki.add(cap)
      // Its sageo, looped once round the knob and hanging in a short tail
      const cord = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.001, -0.12, 0.04),
        new THREE.Vector3(0.03, -0.17, 0.07),
        new THREE.Vector3(0.05, -0.24, 0.06),
        new THREE.Vector3(0.055, -0.31, 0.04),
      ])
      waki.add(mesh(new THREE.TubeGeometry(cord, 16, 0.007, 6), mats.rope))

      // The hilt, out of the scabbard's mouth: seppa, guard, collar, the
      // wrapped grip with its menuki and peg, and the pommel cap.
      const tsuba = mesh(tsubaGeometry(0.08, 0.016), mats.metalDark)
      tsuba.position.y = 0.014
      waki.add(tsuba)
      const tsubaRim = mesh(new THREE.TorusGeometry(0.08, 0.007, 8, 36), mats.gold)
      tsubaRim.position.y = 0.014
      tsubaRim.rotation.x = Math.PI / 2
      waki.add(tsubaRim)
      ;[0.002, 0.026].forEach((yy) => {
        const seppa = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.004, 20), mats.gold)
        seppa.position.y = yy
        seppa.scale.z = 0.8
        waki.add(seppa)
      })
      const fuchi = mesh(new RoundedBoxGeometry(0.064, 0.03, 0.054, 3, 0.011), mats.gold)
      fuchi.position.y = 0.044
      waki.add(fuchi)
      const grip = mesh(new RoundedBoxGeometry(0.058, 0.26, 0.048, 3, 0.02), mats.bowl)
      grip.position.y = 0.19
      waki.add(grip)
      const strip = new RoundedBoxGeometry(0.072, 0.016, 0.014, 1, 0.006)
      const strips = []
      for (let i = 0; i < 5; i++) {
        for (const z of [0.025, -0.025]) {
          for (const tilt of [0.6, -0.6]) {
            strips.push(
              new THREE.Matrix4().compose(
                new THREE.Vector3(0, 0.085 + i * 0.044, z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)),
                new THREE.Vector3(1, 1, 1)
              )
            )
          }
        }
      }
      waki.add(mesh(mergeCopies(strip, strips), mats.helmetLacing))
      strip.dispose()
      const menuki = mesh(new THREE.OctahedronGeometry(0.024, 2), mats.gold)
      menuki.position.set(0, 0.18, 0.031)
      menuki.scale.set(1, 1.4, 0.4)
      waki.add(menuki)
      const peg = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.064, 8), mats.rope)
      peg.rotation.x = Math.PI / 2
      peg.position.y = 0.1
      waki.add(peg)
      const pommel = mesh(new RoundedBoxGeometry(0.066, 0.04, 0.056, 3, 0.017), mats.metalDark)
      pommel.position.y = 0.335
      waki.add(pommel)
      // Where the hilt runs, for the hands and the blade to keep clear of.
      waki.updateMatrix()
      wakizashiHilt = [new THREE.Vector3(0, 0.01, 0), new THREE.Vector3(0, 0.36, 0)].map((p) => p.applyMatrix4(waki.matrix))
    }
    await breathe()

    // Kusazuri: six separate laced panels hanging off the sash. Each hangs
    // from a hinge along its top edge, so it can fan out over the floor and
    // thighs when he sits.
    skirt = new THREE.Group()
    skirt.position.y = -0.04
    skirt.scale.z = 0.76
    body.add(skirt)

    const SKIRT_R = 0.44
    panels = []
    for (let i = 0; i < 6; i++) {
      const center = (i / 6) * Math.PI * 2
      const hinge = new THREE.Group()
      hinge.position.set(Math.sin(center) * SKIRT_R, 0.01, Math.cos(center) * SKIRT_R)
      hinge.rotation.y = center
      skirt.add(hinge)

      const flap = new THREE.Group()
      hinge.add(flap)

      // Undo the hinge transform, so the panel is authored in skirt space.
      const unhinge = new THREE.Group()
      unhinge.position.set(0, -0.01, -SKIRT_R)
      unhinge.rotation.y = -center
      flap.add(unhinge)

      await lamellar(unhinge, {
        rows: 4,
        rowH: 0.078,
        gap: 0.02,
        rTop: SKIRT_R,
        flare: 0.24,
        span: arc(center, Math.PI * 0.25),
        y: 0.01,
        material: [mats.red, mats.red, mats.redDark, mats.red],
        trim: mats.gold,
        hang: 0.07,
        cordsPer: 2,
      })
      // Kneeling: the front panel lies over the thighs, the side panels drape
      // down their outsides, and the rear ones hang almost straight behind.
      const facing = Math.cos(center)
      panels.push({ flap, facing, spread: facing > 0.9 ? 1.35 : facing > 0 ? 0.95 : facing > -0.9 ? 0.45 : 0.35 })
    }

    /* ================================================================
       Shoulders and arms — laced sode over fabric sleeves, mail forearms
       ================================================================ */

    /**
     * A gloved fist: a leather palm block, four curled fingers and a thumb
     * closing over them, and an iron tekko over the back of the hand with a
     * gilt stud and two rivets. Fist space: the grip runs along +Y through
     * the origin, the knuckles face +Z, the back of the hand faces -Z, and
     * `side` mirrors it for the other hand.
     */
    const fist = (side) => {
      const hand = new THREE.Group()
      const palm = mesh(new THREE.SphereGeometry(0.105, 32, 24), mats.leather)
      palm.position.set(0, 0, -0.055)
      palm.scale.set(1.05, 1.25, 0.72)
      hand.add(palm)

      // A finger: a tapered tube curling round the grip from angle a0 to a1
      // (0 = the knuckle side, ±π = the palm side) at radius R.
      const finger = (y, a0, a1, radius, R, taper) => {
        const points = []
        for (let k = 0; k <= 10; k++) {
          const a = a0 + ((a1 - a0) * k) / 10
          points.push(new THREE.Vector3(side * Math.sin(a) * R, y, Math.cos(a) * R))
        }
        const curve = new THREE.CatmullRomCurve3(points)
        const geo = taperTube(new THREE.TubeGeometry(curve, 14, radius, 10), curve, 14, 10, taper)
        hand.add(mesh(geo, mats.leather))
      }
      // Four fingers wrap from the palm's outer edge round the front of the
      // grip, a groove between each, with a red-lacquered plate riding the
      // knuckles to match the splints on the forearm.
      ;[0.085, 0.028, -0.028, -0.085].forEach((y, i) => {
        finger(y, Math.PI * 0.82, -Math.PI * 0.38, 0.026 - i * 0.0015, 0.074, (t) => 1 - 0.25 * t)
        const yubigane = plate(0.1, 0.1, 0.04, arc(side * 0.45, 1.05), mats.red, 0.006)
        yubigane.position.y = y
        hand.add(yubigane)
      })
      // The thumb crosses above them from the inside.
      finger(0.12, -Math.PI * 0.72, Math.PI * 0.28, 0.03, 0.07, (t) => 1 - 0.3 * t)

      // Tekko: an iron plate over the back of the hand, studded and riveted
      const tekko = plate(0.107, 0.103, 0.13, arc(BACK, Math.PI * 0.72), mats.metal, 0.018)
      tekko.position.set(0, 0.01, -0.03)
      hand.add(tekko)
      stud(hand, 0, 0.02, -0.14, Math.PI, 0.7)
      const rivet = new THREE.SphereGeometry(0.008, 8, 6)
      hand.add(
        mesh(
          mergeCopies(rivet, [
            new THREE.Matrix4().makeTranslation(-0.055, 0.06, -0.128),
            new THREE.Matrix4().makeTranslation(0.055, 0.06, -0.128),
          ]),
          mats.metalDark
        )
      )
      rivet.dispose()
      return hand
    }
    // Knuckles toward the blade's edge (katana +X), as a hammer grip holds it.
    const GRIP_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.46, 0.72, 0)
      body.add(shoulder)

      // The ball of the shoulder, in the kosode's silk, under the kohire
      const shoulderBall = mesh(new THREE.SphereGeometry(0.1, 24, 16), mats.silk)
      shoulderBall.position.set(side * 0.01, 0.02, 0)
      shoulder.add(shoulderBall)

      // Sode: five lames draped over the outside of the shoulder
      const outward = side > 0 ? RIGHT : LEFT
      const sode = await lamellar(shoulder, {
        rows: 5,
        rowH: 0.07,
        gap: 0.02,
        rTop: 0.24,
        flare: 0.16,
        span: arc(outward, Math.PI * 0.86),
        y: 0.065,
        material: [mats.red, mats.red, mats.redDark, mats.red, mats.red],
        trim: mats.gold,
        topTrim: mats.gold,
        hang: 0.04,
        cordsPer: 3,
      })
      sode.rotation.z = side * -0.12
      // Rivets fixing the top plate (kanmuri-ita) of the sode
      ;[-0.55, 0, 0.55].forEach((o) => {
        const rv = mesh(new THREE.SphereGeometry(0.009, 8, 6), mats.metalDark)
        rv.position.set(Math.sin(outward + o) * 0.253, -0.009, Math.cos(outward + o) * 0.253)
        sode.add(rv)
      })

      // The kosode sleeve: asanoha silk, bunched above the elbow
      const upper = mesh(
        clothUV(
          foldCloth(new THREE.CylinderGeometry(0.12, 0.11, 0.34, 40, 12), 0.34, {
            rings: [
              [0.08, 0.06, 0.08],
              [0.24, 0.025, 0.07],
            ],
            creases: 0.03,
            seed: side * 2 + 5,
          }),
          0.115,
          0.34,
          5
        ),
        mats.silk
      )
      upper.position.y = -0.36
      shoulder.add(upper)

      // Kote, upper arm: mail over the sleeve from under the sode to just
      // above the elbow (the cloth puffs out below it), with ikada — small
      // lacquered plates sewn on like a raft — over the outside.
      const upperMail = mesh(new THREE.CylinderGeometry(0.125, 0.121, 0.2, 40, 1, true), mats.kusari)
      upperMail.position.y = -0.35
      shoulder.add(upperMail)
      for (const [y, r0, r1] of [
        [-0.3, 0.137, 0.136],
        [-0.385, 0.135, 0.134],
      ]) {
        for (const k of [-1, 0, 1]) {
          const ikada = plate(r0, r1, 0.07, arc(outward + k * 0.45, 0.36), mats.red, 0.01, 2)
          ikada.position.y = y
          shoulder.add(ikada)
        }
        rivetRow(shoulder, r0 + 0.001, y, [outward - 0.675, 1.35], 3, mats.metalDark, 0.8)
      }

      // Mizunomi-no-kan: the gilt ring on the back of the sode's fourth lame,
      // where the cords that steady it are tied
      {
        const a = outward + side * Math.PI * 0.36
        const ring = mesh(new THREE.TorusGeometry(0.018, 0.0045, 8, 20), mats.gold)
        ring.position.set(Math.sin(a) * 0.31, 0.065 - 0.305, Math.cos(a) * 0.31)
        ring.rotation.y = a
        sode.add(ring)
      }

      const elbow = new THREE.Group()
      elbow.position.y = -0.56
      shoulder.add(elbow)
      // The joint: padded cloth that fills the bend when the arm folds
      elbow.add(mesh(new THREE.SphereGeometry(0.108, 24, 16), mats.silk))
      // Hiji-gane: a gilt-rimmed cop over the point of the elbow
      {
        const d = new THREE.Vector3(side * 0.75, 0, -0.66).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
        const cop = mesh(new THREE.SphereGeometry(0.072, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.red)
        cop.position.copy(d).multiplyScalar(0.09)
        cop.quaternion.copy(q)
        cop.scale.set(1, 0.5, 1)
        elbow.add(cop)
        const rim = mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 36), mats.gold)
        rim.position.copy(d).multiplyScalar(0.092)
        rim.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
        elbow.add(rim)
        const boss = mesh(STUD, mats.gold)
        boss.position.copy(d).multiplyScalar(0.125)
        boss.quaternion.copy(q)
        boss.scale.setScalar(0.5)
        elbow.add(boss)
      }

      // Kote: mail sleeve with three lacquered splints on the outside
      const fore = mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.36, 40), mats.kusari)
      fore.position.y = -0.18
      elbow.add(fore)

      ;[-1, 0, 1].forEach((k) => {
        const splint = plate(0.126, 0.13, 0.24, arc(outward + k * 0.42, 0.3), mats.red, 0.02)
        splint.position.y = -0.18
        elbow.add(splint)
      })

      const koteTrim = plate(0.122, 0.124, 0.024, arc(outward, Math.PI * 0.86), mats.gold, 0.014)
      koteTrim.position.y = -0.05
      elbow.add(koteTrim)

      const koteCuff = plate(0.126, 0.128, 0.024, arc(outward, Math.PI * 0.86), mats.leather, 0.014)
      koteCuff.position.y = -0.325
      elbow.add(koteCuff)

      // Ties holding the kote on, knotted on the inside of the forearm
      // through a small brass ring
      ;[-0.1, -0.27].forEach((yy, i) => {
        const tie = mesh(new THREE.TorusGeometry(0.106, 0.007, 6, 40), mats.rope)
        tie.position.y = yy
        tie.rotation.x = Math.PI / 2
        elbow.add(tie)
        const knot = mesh(new THREE.SphereGeometry(0.015, 10, 8), mats.rope)
        knot.position.set(-Math.sin(outward) * 0.108, yy, 0.02)
        elbow.add(knot)
        if (i === 0) {
          const ring = mesh(new THREE.TorusGeometry(0.013, 0.0035, 6, 16), mats.gold)
          ring.position.set(-Math.sin(outward) * 0.112, yy - 0.02, 0.03)
          ring.rotation.y = outward
          elbow.add(ring)
        }
      })

      stud(elbow, Math.sin(outward) * 0.138, -0.18, 0, outward, 0.8)

      // The free hand: its own rigid part, turned each frame to close on
      // the grip in two-handed guards. The katana hand is built with the
      // katana below, so its fingers always wrap the tsuka.
      let hand = null
      if (side < 0) {
        hand = fist(side)
        hand.position.set(0, -0.4, 0.02)
        elbow.add(hand)
      }

      arms.push({ shoulder, elbow, side, sode, hand })
      await breathe()
    }

    /* ================================================================
       Head — a black lacquered menpō with lit eye slits
       ================================================================ */
    headRig = new THREE.Group()
    headRig.position.y = HEAD_Y - HIP_Y
    headRig.rotation.order = 'YXZ'
    body.add(headRig)

    // The cranium is an ellipsoid; the mask plates below are built in a
    // group with the same depth scale, so curved plates sit on its surface.
    const FACE_R = 0.46
    const FACE_SY = 0.92
    const FACE_SZ = 0.94
    const faceRing = (y) => Math.sqrt(Math.max(FACE_R * FACE_R - (y / FACE_SY) ** 2, 0.02))

    const face = mesh(new THREE.SphereGeometry(FACE_R, 64, 40), mats.helmetRound)
    face.scale.set(1, FACE_SY, FACE_SZ)
    headRig.add(face)

    const mask = new THREE.Group()
    mask.scale.z = FACE_SZ
    headRig.add(mask)

    // Every mask plate hugs the skull: its outer radius follows the face's
    // curve from its bottom edge to its top, a set distance proud of it.
    const hugging = (yBottom, height, proud) => (t) => faceRing(yBottom + height * t) + proud

    // Brow: a heavy ridge following the curve of the skull
    const brow = plate(
      faceRing(0.305) + 0.014,
      faceRing(0.215) + 0.014,
      0.09,
      arc(FRONT, Math.PI * 0.9),
      mats.helmet,
      0.03,
      8,
      'world',
      hugging(0.215, 0.09, 0.014)
    )
    brow.position.y = 0.26
    mask.add(brow)

    // Eye band: a dark plate the slits are cut into
    const eyeBand = plate(
      faceRing(0.21) + 0.01,
      faceRing(0.02) + 0.01,
      0.19,
      arc(FRONT, Math.PI * 0.84),
      mats.helmet,
      0.028,
      8,
      'world',
      hugging(0.02, 0.19, 0.01)
    )
    eyeBand.position.y = 0.115
    mask.add(eyeBand)

    // Long, nearly level slits: focused rather than angry. Each is a
    // flattened capsule set into the band, with a soft additive halo, and
    // is framed by a gilt rim it opens and closes within.
    const eyeGeo = track(new THREE.CapsuleGeometry(0.03, 0.19, 8, 24))
    eyeGeo.rotateZ(Math.PI / 2)
    eyeGeo.scale(1, 1, 0.45)
    const glowGeo = track(new THREE.PlaneGeometry(0.42, 0.24))
    const EYE_R = faceRing(0.11) + 0.024
    eyes = []
    glows = []
    ;[-1, 1].forEach((side) => {
      const a = side * 0.4
      const eye = new THREE.Mesh(eyeGeo, mats.eye)
      eye.position.set(Math.sin(a) * EYE_R, 0.11, Math.cos(a) * EYE_R)
      eye.rotation.set(0, a, side * 0.06)
      mask.add(eye)
      eyes.push(eye)

      const glow = new THREE.Mesh(glowGeo, glowMat)
      glow.position.set(Math.sin(a) * (EYE_R + 0.025), 0.11, Math.cos(a) * (EYE_R + 0.025))
      glow.rotation.set(0, a, side * 0.06)
      mask.add(glow)
      glows.push(glow)

      const rim = mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 40), mats.gold)
      rim.position.set(Math.sin(a) * (EYE_R + 0.006), 0.11, Math.cos(a) * (EYE_R + 0.006))
      rim.rotation.set(0, a, side * 0.06)
      rim.scale.set(3.15, 0.95, 0.7)
      mask.add(rim)
    })
    // The glow of the eyes falls on the mask, the peak and anything raised
    // to the face; its colour and strength follow the mood each frame.
    eyeLight = new THREE.PointLight(0xffb347, 0, 1.3, 2)
    eyeLight.position.set(0, 0.11, (EYE_R + 0.12) * FACE_SZ)
    headRig.add(eyeLight)

    /* ---- The sculpted face of the menpō ---- */
    // A point on the mask's surface at angle `a` round the face, height
    // `y`, standing `lift` off the cranium; the plates sit 0.01–0.014 proud.
    const onFace = (a, y, lift) => {
      const r = faceRing(y) + lift
      return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r)
    }
    // A raised fold of lacquered iron along a path, thinning to its ends.
    const fold = (points, radius, material = mats.helmet) => {
      const curve = new THREE.CatmullRomCurve3(points)
      const geo = taperTube(new THREE.TubeGeometry(curve, 16, radius, 8), curve, 16, 8, (t) =>
        0.5 + 0.5 * Math.sin(Math.PI * t)
      )
      mask.add(mesh(geo, material))
    }

    // Brow folds: heavy ridges over each eye, drawn a little toward the centre
    ;[-1, 1].forEach((side) => {
      fold(
        [0, 0.25, 0.5, 0.75, 1].map((t) => onFace(side * (0.66 - 0.5 * t), 0.197 - 0.03 * t, 0.019)),
        0.013
      )
    })
    // The bridge of the nose, running up between the eyes to the brow plate
    fold(
      [0, 0.33, 0.66, 1].map((t) => onFace(0, -0.02 + 0.21 * t, 0.024 - 0.006 * t)),
      0.012
    )

    // Cheek plates
    ;[-1, 1].forEach((side) => {
      const a = side * 1.0
      const cheek = plate(
        faceRing(0.06) + 0.012,
        faceRing(-0.24) + 0.012,
        0.3,
        arc(a, 0.55),
        mats.helmet,
        0.024,
        8,
        'world',
        hugging(-0.24, 0.3, 0.012)
      )
      cheek.position.y = -0.09
      mask.add(cheek)
    })

    // Nose: a ridge with a pair of dark nostrils at its base
    const nose = mesh(new THREE.ConeGeometry(0.075, 0.2, 24), mats.helmetRound)
    nose.position.set(0, -0.02, 0.42)
    nose.rotation.x = -0.42
    nose.scale.x = 0.85
    mask.add(nose)
    ;[-1, 1].forEach((side) => {
      const nostril = mesh(new THREE.SphereGeometry(0.013, 12, 8), mats.metalDark)
      nostril.position.set(side * 0.03, -0.116, 0.452)
      mask.add(nostril)
    })

    // Mouth guard: tapers in toward the chin. It carries a breathing slot
    // above the mouth and another below, the mouth itself open on a row of
    // gilt teeth, and two folds down each cheek.
    const GUARD_TOP = faceRing(-0.05) + 0.012
    const GUARD_BOT = faceRing(-0.35) + 0.012
    const guardR = (yy) => faceRing(yy) + 0.012
    const guard = plate(
      GUARD_TOP,
      GUARD_BOT,
      0.3,
      arc(FRONT, Math.PI * 0.72),
      mats.helmet,
      0.03,
      8,
      'world',
      hugging(-0.35, 0.3, 0.012)
    )
    guard.position.y = -0.2
    mask.add(guard)

    for (const [yy, h, sweep] of [
      [-0.118, 0.014, 0.5],
      [-0.19, 0.034, 0.6],
      [-0.25, 0.014, 0.44],
    ]) {
      const r = guardR(yy) + 0.004
      const slot = plate(r - 0.002, r + 0.002, h, arc(FRONT, sweep), mats.metalDark, 0.01, 12)
      slot.position.y = yy
      mask.add(slot)
    }
    const tooth = new THREE.BoxGeometry(0.013, 0.015, 0.008)
    const teeth = []
    for (let i = 0; i < 8; i++) {
      const a = -0.245 + (0.49 * i) / 7
      const r = guardR(-0.182) + 0.008
      teeth.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(Math.sin(a) * r, -0.182, Math.cos(a) * r),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
          new THREE.Vector3(1, 1, 1)
        )
      )
    }
    mask.add(mesh(mergeCopies(tooth, teeth), mats.gold))
    tooth.dispose()

    // Cheek folds, from beside the nostrils down and out toward the jaw
    const onGuard = (a, yy, lift) => {
      const r = guardR(yy) + lift
      return new THREE.Vector3(Math.sin(a) * r, yy, Math.cos(a) * r)
    }
    ;[-1, 1].forEach((side) => {
      fold(
        [0, 0.33, 0.66, 1].map((t) => onGuard(side * (0.45 + 0.5 * t), -0.13 - 0.14 * t, 0.008)),
        0.011
      )
      fold(
        [0, 0.33, 0.66, 1].map((t) => onGuard(side * (0.62 + 0.42 * t), -0.215 - 0.1 * t, 0.008)),
        0.01
      )
    })

    // Kuchihige: a horsehair moustache hung beneath the nose in two rows,
    // each strand splayed outward and lifted a little off the guard
    const strand = new THREE.CylinderGeometry(0.0045, 0.0012, 0.055, 5)
    const strands = []
    const one = new THREE.Vector3(1, 1, 1)
    for (const [yy, count, phase] of [
      [-0.134, 16, 0],
      [-0.142, 15, 0.5],
    ]) {
      for (let i = 0; i < count; i++) {
        const a = -0.36 + (0.72 * (i + phase)) / (count - 1 + phase * 2)
        const root = onGuard(a, yy, 0.009)
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, a, -Math.sign(a) * (0.3 + 0.9 * Math.abs(a)), 'YXZ'))
        strands.push(
          new THREE.Matrix4().compose(root, q, one).multiply(new THREE.Matrix4().makeTranslation(0, -0.0275, 0))
        )
      }
    }
    mask.add(mesh(mergeCopies(strand, strands), mats.helmetLacing))
    strand.dispose()

    // Gold sunbursts lacquered onto the cheeks, either side of the nose.
    // They lie over the eye band and the mouth guard, which stand proud of
    // the skull there, so the whole burst shows.
    const burst = track(sunburstGeometry())
    ;[-1, 1].forEach((side) => {
      const a = side * 0.53
      const yy = -0.022
      const r = Math.max(faceRing(0.02) + 0.02, GUARD_TOP + 0.012)
      const sun = new THREE.Mesh(burst, mats.gold)
      sun.castShadow = sun.receiveShadow = true
      sun.position.set(Math.sin(a) * r, yy, Math.cos(a) * r)
      sun.rotation.order = 'YXZ'
      sun.rotation.set(0.02, a, side * 0.35)
      sun.scale.setScalar(1.15)
      mask.add(sun)
    })

    // Chin
    const chin = mesh(new THREE.SphereGeometry(0.065, 32, 20), mats.helmetRound)
    chin.position.set(0, -0.355, 0.235)
    chin.scale.set(1.3, 0.75, 0.8)
    mask.add(chin)

    // Ori-kugi: a gilt peg on each cheek plate, and the helmet cord
    // (shinobi-no-o) coming down from under the peak, hooked round the peg
    // with a knot, its end hanging under the jaw
    ;[-1, 1].forEach((side) => {
      const at = onFace(side * 1.05, -0.16, 0.03)
      const peg = mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.036, 8), mats.gold)
      peg.position.copy(at)
      peg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().setY(0).normalize())
      mask.add(peg)

      const cordCurve = new THREE.CatmullRomCurve3([
        onFace(side * 1.24, 0.24, 0.025),
        onFace(side * 1.19, 0.08, 0.021),
        onFace(side * 1.12, -0.08, 0.023),
        onFace(side * 1.05, -0.16, 0.05),
        onFace(side * 0.98, -0.25, 0.024),
        onFace(side * 0.86, -0.33, 0.024),
      ])
      mask.add(mesh(new THREE.TubeGeometry(cordCurve, 28, 0.009, 8), mats.rope))
      const knot = mesh(new THREE.SphereGeometry(0.017, 12, 10), mats.rope)
      knot.position.copy(onFace(side * 1.05, -0.16, 0.052))
      knot.scale.set(1.2, 0.9, 1)
      mask.add(knot)
    })

    // Yodare-kake: two laced lames guarding the throat beneath the mask
    await lamellar(mask, {
      rows: 2,
      rowH: 0.06,
      gap: 0.014,
      rTop: 0.285,
      flare: 0.6,
      span: arc(FRONT, Math.PI * 0.9),
      y: -0.37,
      material: mats.helmetLame,
      lacing: mats.helmetLacing,
      cordsPer: 4,
      thickness: 0.02,
    })

    // (No cloth collar: the yodare-kake above closes the throat, as on real
    // armour, and the dō's own collar sits beneath it.)
    tails = []
    await breathe()

    /* ================================================================
       Kabuto — black lacquer flecked with gold, a broad engraved crest
       ================================================================ */
    helmet = new THREE.Group()
    helmet.position.y = 0.14
    headRig.add(helmet)

    const bowlRig = new THREE.Group()
    bowlRig.position.y = 0.16
    bowlRig.scale.y = 1.12
    helmet.add(bowlRig)

    const bowl = mesh(
      new THREE.SphereGeometry(0.6, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.helmetRound
    )
    bowlRig.add(bowl)
    // Ukebari: the cloth lining inside the bowl. A hemisphere turned inside
    // out (faces and normals reversed), so looking up under the peak meets
    // dark cloth rather than the culled back of the bowl.
    const ukebari = new THREE.SphereGeometry(0.578, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5)
    ukebari.scale(-1, 1, 1)
    const inward = ukebari.attributes.normal
    for (let i = 0; i < inward.count; i++) inward.setXYZ(i, -inward.getX(i), -inward.getY(i), -inward.getZ(i))
    bowlRig.add(mesh(ukebari, mats.fabric))

    // A few low seams where the bowl's plates meet, one running up the front
    const seamCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 9 }, (_, i) => {
        const phi = 0.12 + (i / 8) * (Math.PI / 2 - 0.14)
        return new THREE.Vector3(Math.sin(phi) * 0.598, Math.cos(phi) * 0.598, 0)
      })
    )
    const seam = taperTube(new THREE.TubeGeometry(seamCurve, 24, 0.009, 6), seamCurve, 24, 6, (t) =>
      0.6 + t * 0.4
    )
    // Sixteen plates, as a suji-bachi is built, each seam raised and riveted
    const SEAMS = 16
    bowlRig.add(
      mesh(
        mergeCopies(
          seam,
          Array.from({ length: SEAMS }, (_, i) => new THREE.Matrix4().makeRotationY((i / SEAMS) * Math.PI * 2))
        ),
        mats.helmetRound
      )
    )
    seam.dispose()

    // Hoshi: rows of gilt dome rivets riding each seam
    const hoshi = new THREE.SphereGeometry(0.013, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
    const hoshiAt = []
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < SEAMS; i++) {
      for (const phi of i % 2 ? [0.62, 0.98, 1.32] : [0.4, 0.68, 0.96, 1.24]) {
        const n = new THREE.Vector3(Math.sin(phi), Math.cos(phi), 0).applyAxisAngle(up, (i / SEAMS) * Math.PI * 2)
        hoshiAt.push(
          new THREE.Matrix4().compose(
            n.clone().multiplyScalar(0.604),
            new THREE.Quaternion().setFromUnitVectors(up, n),
            new THREE.Vector3(1, 1, 1)
          )
        )
      }
    }
    bowlRig.add(mesh(mergeCopies(hoshi, hoshiAt), mats.gold))
    hoshi.dispose()

    // Shinodare: gilt strips running down from the crown over the front,
    // back and side seams, broad at the top and narrowing toward the rim
    for (const i of [0, 4, 8, 12]) {
      const strip = mesh(meridianStrip(0.607, 0.17, 1.28, 0.05, 0.022), mats.gold)
      strip.rotation.y = (i / SEAMS) * Math.PI * 2
      bowlRig.add(strip)
    }

    // Kasa-jirushi-no-kan: the gilt ring low on the back of the bowl that a
    // small identifying flag is tied to, hanging from a riveted mount
    {
      const n = new THREE.Vector3(0, Math.cos(1.18), -Math.sin(1.18))
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
      const ring = mesh(new THREE.TorusGeometry(0.03, 0.0075, 10, 28), mats.gold)
      ring.position.copy(n).multiplyScalar(0.612).add(new THREE.Vector3(0, -0.028, 0))
      ring.quaternion.copy(q)
      bowlRig.add(ring)
      const mount = mesh(STUD, mats.gold)
      mount.position.copy(n).multiplyScalar(0.602)
      mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
      mount.scale.setScalar(0.55)
      bowlRig.add(mount)
    }

    // Tehen-no-kanamono: the tiered gilt fitting round the vent at the crown
    const tehen = new THREE.Group()
    tehen.position.y = 0.596
    bowlRig.add(tehen)
    let tehenY = 0
    for (const [r, h] of [
      [0.082, 0.02],
      [0.064, 0.018],
      [0.048, 0.016],
    ]) {
      const tier = mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 40), mats.gold)
      tier.position.y = tehenY + h / 2
      tehen.add(tier)
      tehenY += h
    }
    const vent = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 24), mats.metalDark)
    vent.position.y = tehenY
    tehen.add(vent)

    // Koshimaki: a raised band round the base of the bowl
    const band = plate(0.615, 0.615, 0.06, [0, Math.PI * 2], mats.helmet, 0.03, 96)
    band.position.y = 0.19
    helmet.add(band)

    // Mabisashi: the peak, sweeping forward and down, with a rolled lip
    const visor = plate(0.6, 0.76, 0.1, arc(FRONT, Math.PI * 0.82), mats.helmet, 0.022, 36)
    visor.position.y = 0.23
    helmet.add(visor)
    const visorLip = plate(0.76, 0.772, 0.022, arc(FRONT, Math.PI * 0.82), mats.helmet, 0.03, 36)
    visorLip.position.y = 0.183
    helmet.add(visorLip)

    // Shikoro: black lames guarding the back of the neck, closely laced
    const shikoro = await lamellar(helmet, {
      rows: 4,
      rowH: 0.08,
      gap: 0.026,
      rTop: 0.625,
      flare: 0.34,
      span: arc(BACK, Math.PI * 1.44),
      y: 0.13,
      material: mats.helmetLame,
      lacing: mats.helmetLacing,
      cordsPer: 12,
    })
    shikoro.position.z = -0.08
    shikoro.rotation.x = 0.22

    // Fukigaeshi: the lames turned back beside the face into broad wings
    ;[-1, 1].forEach((side) => {
      const span = arc(side > 0 ? RIGHT : LEFT, Math.PI * 0.72)
      const wingRig = new THREE.Group()
      wingRig.position.set(side * 0.6, 0.06, 0.18)
      wingRig.rotation.set(0.08, 0, side * 0.42)
      helmet.add(wingRig)
      wingRig.add(plate(0.17, 0.27, 0.36, span, mats.helmet, 0.026))
      const lip = plate(0.27, 0.272, 0.024, span, mats.helmet, 0.034)
      lip.position.y = -0.168
      wingRig.add(lip)
      // A gilt kiku kanamono on the turned-back face, where it shows from
      // the front
      const a = side * (Math.PI / 2 - 0.62)
      const out = new THREE.Vector3(Math.sin(a), 0.278, Math.cos(a)).normalize()
      const mon = kikuMon(0.046)
      mon.position.set(Math.sin(a) * 0.232, 0.02, Math.cos(a) * 0.232)
      mon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      wingRig.add(mon)
    })

    // Maedate: a broad gilt crest, two swept blades rising from a
    // chrysanthemum boss, engraved all over with scrolling clouds. It stands
    // on the front of the bowl just above the peak, leaning back a little,
    // and nods a touch on its mount when the head moves fast.
    crest = new THREE.Group()
    crest.position.set(0, 0.37, 0.6)
    crest.rotation.x = -0.28
    helmet.add(crest)
    crest.add(mesh(crestGeometry(), mats.crest))

    // Kiku boss: sixteen petals round a domed centre
    const boss = new THREE.Group()
    boss.position.z = 0.02
    crest.add(boss)
    const bossDisc = mesh(new THREE.CylinderGeometry(0.086, 0.092, 0.028, 40), mats.gold)
    bossDisc.rotation.x = Math.PI / 2
    boss.add(bossDisc)
    const petal = new THREE.SphereGeometry(1, 10, 6)
    boss.add(
      mesh(
        mergeCopies(
          petal,
          Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            return new THREE.Matrix4().compose(
              new THREE.Vector3(Math.sin(a) * 0.058, Math.cos(a) * 0.058, 0.016),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a),
              new THREE.Vector3(0.013, 0.03, 0.009)
            )
          })
        ),
        mats.gold
      )
    )
    petal.dispose()
    const bossDome = mesh(new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.gold)
    bossDome.rotation.x = Math.PI / 2
    bossDome.position.z = 0.016
    boss.add(bossDome)

    await breathe()

    /* ================================================================
       Katana — held low in the right hand
       ================================================================ */
    katana = new THREE.Group()
    arms[1].elbow.add(katana)
    katana.position.set(0.02, -0.4, 0.04)

    // The sword hand, closed round the tsuka just below the collar
    const swordHand = fist(1)
    swordHand.position.y = -0.02
    swordHand.quaternion.copy(GRIP_Q)
    katana.add(swordHand)

    // Tsuka: white ray skin under a crossed black silk wrap
    const core = mesh(new RoundedBoxGeometry(0.086, 0.5, 0.072, 4, 0.03), mats.bowl)
    core.position.y = -0.12
    katana.add(core)

    const wrap = new RoundedBoxGeometry(0.108, 0.022, 0.02, 3, 0.009)
    const wrapMatrices = []
    for (let i = 0; i < 8; i++) {
      for (const z of [0.038, -0.038]) {
        for (const tilt of [0.6, -0.6]) {
          wrapMatrices.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(0, 0.1 - i * 0.056, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)),
              new THREE.Vector3(1, 1, 1)
            )
          )
        }
      }
    }
    katana.add(mesh(mergeCopies(wrap, wrapMatrices), mats.helmetLacing))
    wrap.dispose()

    const menuki = mesh(new THREE.OctahedronGeometry(0.035, 2), mats.gold)
    menuki.position.set(0, -0.13, 0.046)
    menuki.scale.set(1, 1.4, 0.4)
    katana.add(menuki)

    const kashira = mesh(new RoundedBoxGeometry(0.1, 0.06, 0.086, 4, 0.025), mats.metalDark)
    kashira.position.y = -0.39
    katana.add(kashira)

    const fuchi = mesh(new RoundedBoxGeometry(0.098, 0.04, 0.084, 4, 0.015), mats.gold)
    fuchi.position.y = 0.13
    katana.add(fuchi)

    const tsuba = mesh(tsubaGeometry(0.17, 0.024), mats.metalDark)
    tsuba.position.y = 0.165
    katana.add(tsuba)

    const tsubaRim = mesh(new THREE.TorusGeometry(0.17, 0.012, 12, 64), mats.gold)
    tsubaRim.position.y = 0.165
    tsubaRim.rotation.x = Math.PI / 2
    katana.add(tsubaRim)

    // Seppa: thin washers either side of the guard; mekugi: the bamboo peg
    // pinning the blade's tang into the handle
    ;[0.146, 0.184].forEach((yy) => {
      const seppa = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 24), mats.gold)
      seppa.position.y = yy
      seppa.scale.z = 0.8
      katana.add(seppa)
    })
    const mekugi = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 8), mats.rope)
    mekugi.rotation.x = Math.PI / 2
    mekugi.position.y = 0.06
    katana.add(mekugi)

    const habaki = mesh(new RoundedBoxGeometry(0.09, 0.07, 0.04, 4, 0.015), mats.gold)
    habaki.position.y = 0.215
    katana.add(habaki)

    const blade = mesh(bladeGeometry(1.26), mats.steel)
    blade.position.y = 0.19
    katana.add(blade)

    /* ---- Bake every rigid part down to a few meshes ---- */
    await breathe()
    await bake(crest)
    await bake(helmet, [crest])
    await bake(mask, [...eyes, ...glows])
    await bake(cuirass)
    for (const { flap } of panels) await bake(flap)
    await bake(saya)
    await bake(agemaki)
    await bake(body, [torso, cuirass, skirt, headRig, saya, agemaki, ...arms.map((a) => a.shoulder)])
    await bake(katana)
    for (const { shoulder, elbow, sode, hand } of arms) {
      await bake(sode)
      if (hand) await bake(hand)
      await bake(elbow, hand ? [katana, hand] : [katana])
      await bake(shoulder, [elbow, sode])
    }
    for (const { hip, knee, ankle } of legs) {
      await bake(ankle)
      await bake(knee, [ankle])
      await bake(hip, [knee])
    }
    // Meshes that stay live (eyes, cranium) still need a colour attribute,
    // since their materials read one.
    samurai.traverse((o) => {
      if (!o.isMesh || !o.material.vertexColors || o.geometry.attributes.color) return
      const n = o.geometry.attributes.position.count
      o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3))
    })
  }

  /* ---- Theme: every colour comes from a --samurai-* CSS token ---- */
  // The eyes are tinted by mood every frame, starting from this colour.
  const eyeBase = cssColor('--samurai-eye', '#ffb347')
  const applyTheme = () => {
    themeMaterials(allMats)
    eyeBase.copy(cssColor('--samurai-eye', '#ffb347'))
  }

  return {
    root: samurai,
    mats,
    glowMat,
    eyeBase,
    /** The shared rim uniforms: { color, power } (see withRim). */
    rim,
    /** Every material he is drawn with. */
    materials: allMats,
    /** Builds the samurai in slices; resolves with his rig. */
    async build() {
      await buildModel()
      return nameRig({
        root: samurai,
        legs,
        arms,
        panels,
        eyes,
        glows,
        tails,
        body,
        torso,
        cuirass,
        skirt,
        headRig,
        helmet,
        katana,
        saya,
        sayaStand,
        sayaSeated,
        crest,
        agemaki,
        eyeLight,
        wakizashiHilt,
        // The sode's resting turn, which the arms' swing is applied on top of.
        sodeBaseQ: arms.map(({ sode }) => sode.quaternion.clone()),
      })
    },
    /** Pours the worker's generated pixels into the texture slots. */
    fillTextures(pixels) {
      fillTextureSlots(maps, pixels, extraMaps)
    },
    applyTheme,
    dispose() {
      geos.forEach((g) => g.dispose())
      geos.clear()
      allMats.forEach((m) => m.dispose())
      Object.values(maps).forEach((t) => t.dispose())
      extraMaps.forEach((t) => t.dispose())
    },
  }
}

/** Recolours every material that names a --samurai-* token (userData.token). */
export function themeMaterials(materials) {
  for (const m of materials) {
    if (m.userData?.token && m.color) m.color.copy(cssColor(m.userData.token, m.userData.fallback || '#ffffff'))
  }
}

/**
 * The rim term, added to each lit material's emitted light: strongest
 * where the surface turns away from the viewer. `this` is the material.
 */
export function addRim(shader) {
  const { rim } = this.userData
  shader.uniforms.rimColor = rim.color
  shader.uniforms.rimPower = rim.power
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += rimColor * pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), rimPower );'
    )
}

/**
 * Names the joints after the rig contract (rig.js), so a GLB built on the
 * same skeleton can be driven by the same code. Sides are anatomical: the
 * figure is mirrored, so +X in its own frame — the katana hand — is his
 * right.
 */
function nameRig(rig) {
  const side = (s) => (s > 0 ? 'R' : 'L')
  rig.root.name = 'samurai'
  // What a GLB exported from this rig needs to be driven the same way
  // (glTF keeps userData as extras): see SamuraiLoader's rigFromScene.
  rig.root.userData.rig = RIG_VERSION
  rig.kind = 'samurai'
  for (const { hip, knee, ankle, side: s } of rig.legs) {
    hip.name = `hip_${side(s)}`
    knee.name = `knee_${side(s)}`
    ankle.name = `ankle_${side(s)}`
  }
  rig.body.name = 'body'
  rig.torso.name = 'torso'
  rig.cuirass.name = 'cuirass'
  rig.skirt.name = 'skirt'
  rig.panels.forEach(({ flap, facing, spread }, i) => {
    flap.name = `kusazuri_${i}`
    flap.userData.facing = facing
    flap.userData.spread = spread
  })
  rig.saya.name = 'saya'
  rig.saya.userData.stand = rig.sayaStand.toArray()
  rig.saya.userData.seated = rig.sayaSeated.toArray()
  rig.agemaki.name = 'agemaki'
  rig.headRig.name = 'head'
  rig.helmet.name = 'helmet'
  rig.crest.name = 'crest'
  rig.eyes.forEach((eye, i) => (eye.name = `eye_${i === 0 ? 'L' : 'R'}`))
  rig.glows.forEach((glow, i) => (glow.name = `eyeGlow_${i === 0 ? 'L' : 'R'}`))
  rig.eyeLight.name = 'eyeLight'
  for (const { shoulder, elbow, sode, hand, side: s } of rig.arms) {
    shoulder.name = `shoulder_${side(s)}`
    elbow.name = `elbow_${side(s)}`
    sode.name = `sode_${side(s)}`
    if (hand) hand.name = `hand_${side(s)}`
  }
  rig.katana.name = 'katana'
  // Sockets on the blade for the effects: just past the guard, and the tip.
  const base = new THREE.Object3D()
  base.name = 'katana_base'
  base.position.set(0, 0.32, 0)
  const tip = new THREE.Object3D()
  tip.name = 'katana_tip'
  tip.position.set(0, 1.48, 0)
  rig.katana.add(base, tip)
  rig.sockets = { katanaBase: base, katanaTip: tip }
  return rig
}
