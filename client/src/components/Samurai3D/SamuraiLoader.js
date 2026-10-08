import * as THREE from 'three'
import { cssColor } from '../../lib/three-utils.js'
import { addRim, createSamuraiModel, themeMaterials } from './SamuraiModel.js'
import { genericRig, rigFromScene } from './rig.js'

/**
 * loadModel(source, context) — the samurai's model, from either source:
 *
 *   null / 'procedural'   the built-in samurai, modelled in code
 *                         (SamuraiModel.js): no download beyond the code.
 *   a URL ('…/x.glb')     a GLB. Meshopt, Draco and KTX2 (Basis) compressed
 *                         files are all understood. The loaders and their
 *                         decoders (wasm) are bundled as separate files that
 *                         are only fetched when a GLB is loaded.
 *
 * context: { renderer, maxAnisotropy, integrated, breathe, data? }
 *   (`data`: the GLB's bytes when already fetched, e.g. by preloadSamurai)
 *
 * Both resolve to the same shape, which the engine drives:
 *   { kind: 'procedural' | 'glb',
 *     rigKind: 'samurai' | 'generic'   (see rig.js),
 *     root, materials, rim, mats: { eye, steel }, glowMat, eyeBase, clips,
 *     build()            → the rig (the built-in model builds in slices),
 *     fillTextures(px), applyTheme(), dispose() }
 *
 * A GLB on the samurai rig (rig.js RIG_VERSION) gets his full procedural
 * performance; any other rigged character is played from its clips.
 */
export async function loadModel(source, context) {
  if (!source || source === 'procedural') {
    const model = createSamuraiModel(context)
    return { kind: 'procedural', rigKind: 'samurai', clips: [], ...model }
  }
  return loadGLB(source, context)
}

async function loadGLB(url, { renderer, data = null }) {
  const [{ GLTFLoader }, { DRACOLoader, DRACO_GLTF_CONFIG }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
    import('three/examples/jsm/loaders/KTX2Loader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ])
  // Decoders: the glTF-only Draco build, and the Basis transcoder for KTX2.
  const draco = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG)
  const ktx2 = new KTX2Loader().detectSupport(renderer)
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
  let gltf
  try {
    const base = new URL(url, window.location.href).href
    gltf = data
      ? await loader.parseAsync(data, base.slice(0, base.lastIndexOf('/') + 1))
      : await loader.loadAsync(url)
  } finally {
    draco.dispose()
    ktx2.dispose()
  }

  const scene = gltf.scene
  const rim = { color: { value: new THREE.Color(0, 0, 0) }, power: { value: 3 } }
  const materials = new Set()
  scene.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    for (const m of [].concat(o.material)) materials.add(m)
  })
  for (const m of materials) {
    // The rim (WebGL; on WebGPU the renderer adds it as a node instead).
    if (m.isMeshStandardMaterial) {
      m.userData.rim = rim
      m.onBeforeCompile = addRim
    }
    // glTF has no additive blending: the eye halos get theirs back.
    if (m.name === 'glow') {
      m.transparent = true
      m.depthWrite = false
      m.blending = THREE.AdditiveBlending
    }
  }
  const named = (name) => [...materials].find((m) => m.name === name)
  // Materials the animation tints; stand-ins when a model has none.
  const eye = named('eye') || new THREE.MeshStandardMaterial({ emissive: 0xffb347 })
  const steel = named('steel') || new THREE.MeshStandardMaterial()
  const glowMat = named('glow') || new THREE.MeshBasicMaterial()
  const eyeBase = cssColor('--samurai-eye', '#' + (eye.emissive || eye.color).getHexString())
  // In development, ?samurai-rig=clips plays even a samurai-rig GLB from
  // its clips, to try the clip player.
  const clipsOnly =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('samurai-rig') === 'clips'
  const samuraiRig = clipsOnly ? null : rigFromScene(scene)

  return {
    kind: 'glb',
    rigKind: samuraiRig ? 'samurai' : 'generic',
    root: scene,
    clips: gltf.animations || [],
    materials: [...materials],
    rim,
    mats: { eye, steel },
    glowMat,
    eyeBase,
    async build() {
      return samuraiRig || genericRig(scene)
    },
    fillTextures() {},
    applyTheme() {
      themeMaterials(materials)
      if (eye.userData.token) eyeBase.copy(cssColor(eye.userData.token, eye.userData.fallback))
    },
    dispose() {
      const textures = new Set()
      scene.traverse((o) => o.geometry?.dispose())
      for (const m of materials) {
        for (const value of Object.values(m)) if (value?.isTexture) textures.add(value)
        m.dispose()
      }
      textures.forEach((t) => t.dispose())
    },
  }
}
