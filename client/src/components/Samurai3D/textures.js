import * as THREE from 'three'

/**
 * The samurai's surface maps. The pixels are generated in a worker (see
 * lib/samurai-textures.js); here they are given texture objects. Materials
 * are built against empty 1×1 placeholders so their shaders can compile
 * before the worker is done, and the real pixels are poured in later.
 */

/**
 * How each map is sampled. Plates carry world-scale UVs (UV_SCALE per
 * unit), lames carry one row of scales per lame, and the primitives carry
 * their own 0..1 UVs.
 */
export const TEXTURE_SPEC = {
  grain: { repeat: 2 },
  mottle: { repeat: 1, srgb: true },
  lacquerN: { repeat: 1 },
  kozaneN: { repeat: 1, clampV: true },
  ironN: { repeat: 1 },
  ironR: { repeat: 1 },
  weaveN: { repeat: 9 },
  leatherN: { repeat: 3 },
  braidN: { repeat: 6 },
  chainN: { repeat: 9 },
  strawN: { repeat: 26 },
  woodN: { repeat: 1 },
  fabricTone: { repeat: 2, srgb: true },
  blade: { repeat: 1, srgb: true, clamp: true },
  bladeRough: { repeat: 1, clamp: true },
  glow: { repeat: 1, srgb: true, clamp: true },
  flakeC: { repeat: 1, srgb: true },
  flakeR: { repeat: 1 },
  engraveN: { repeat: 3 },
  engraveC: { repeat: 3, srgb: true },
  stencilC: { repeat: 1, srgb: true },
  stencilN: { repeat: 1 },
  // Textiles. The kosode and hakama carry world-scale UVs (see clothUV).
  asanohaC: { repeat: 1, srgb: true },
  asanohaR: { repeat: 1 },
  shimaC: { repeat: 1, srgb: true },
  obiC: { repeat: 8, srgb: true, clampV: true },
  sashikoC: { repeat: 1, srgb: true },
}

/** Empty textures the materials can hold until the worker's pixels arrive. */
export function makeTextureSlots(anisotropy) {
  const slots = {}
  for (const [name, spec] of Object.entries(TEXTURE_SPEC)) {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1)
    t.wrapS = spec.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    t.wrapT = spec.clamp || spec.clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    t.repeat.set(spec.repeat, spec.clampV ? 1 : spec.repeat)
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.generateMipmaps = true
    t.anisotropy = anisotropy
    if (spec.srgb) t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    slots[name] = t
  }
  return slots
}

/**
 * Pours the generated pixels into the slots. `clones` are the re-scaled
 * copies made with Texture.clone(): they share the slots' pixels (one Source
 * between them) but are separate textures to the renderer.
 *
 * Every texture whose size changes is disposed first. WebGL re-specifies a
 * texture freely, but WebGPU allocates storage at creation and would copy
 * the new pixels into the old 1×1 texture; disposing makes it allocate
 * afresh at the real size on next use.
 */
export function fillTextureSlots(slots, maps, clones = []) {
  if (!maps) return
  for (const [name, t] of Object.entries(slots)) {
    const m = maps[name]
    if (!m) continue
    if (t.image.width !== m.w || t.image.height !== m.h) {
      t.dispose()
      for (const c of clones) if (c.source === t.source) c.dispose()
    }
    t.image = { data: m.data, width: m.w, height: m.h }
    t.needsUpdate = true
  }
  for (const c of clones) c.needsUpdate = true
}
