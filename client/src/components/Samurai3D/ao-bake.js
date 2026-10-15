import * as THREE from 'three'

/**
 * Ambient occlusion, baked once into the vertices at load.
 *
 * Every plate, lame and cord of the armour rests on others, and without
 * occlusion they all look pasted on: the gap under a lame, the shade under
 * the helmet's peak, the dark between the lacing and the plate it crosses
 * are what make the parts read as built. Screen-space AO (the post chain)
 * finds that every frame and is the dearest thing an integrated GPU could
 * draw here, so it only runs on fast ones. This finds it once, on the GPU,
 * and stores it per vertex, where it costs nothing to draw.
 *
 * Each cluster is a set of meshes that keep their places relative to each
 * other (the helmet and mask; the trunk; an arm; a leg; the katana), taken
 * in the rest pose. From each of `directions` directions spread evenly over
 * the sphere, the cluster's depth is drawn as a shadow map would be; then
 * every vertex looks itself up in that map, and counts as lit from that
 * direction if nothing of its cluster is in front of it. Weighted by how
 * squarely the vertex faces each direction, the lit share is the fraction
 * of ambient light that reaches it (1 open, 0 enclosed). The tally runs on
 * the GPU: each vertex is one point drawn into its own texel of an
 * accumulation target, summed with additive blending, and read back once.
 *
 *   renderer    a WebGLRenderer (WebGL 2)
 *   clusters    arrays of meshes; each mesh gets a float `ao` attribute.
 *               Meshes must not share geometry with a mesh elsewhere (the
 *               baked parts never do).
 *   options     directions   how many (default 80)
 *               resolution   of each depth map (default 512)
 *               breathe      async slicer awaited between steps
 *               shape        (raw 0..1) => stored value, for the look
 *
 * Resolves when every cluster has its attribute. Leaves the renderer's
 * target, clear colour and viewport as it found them.
 */
export async function bakeAmbientOcclusion(renderer, clusters, options = {}) {
  const { directions = 80, resolution = 512, breathe = async () => {}, shape = (v) => v } = options
  const meshes = clusters.flat()
  const total = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0)
  if (!total) return

  // One texel per vertex, in rows of 1024.
  const W = 1024
  const H = Math.ceil(total / W)
  // Additive blending into 32-bit float needs EXT_float_blend; half float
  // blends everywhere WebGL 2 renders to it, a little less precisely.
  const floatBlend = renderer.extensions.has('EXT_float_blend')
  const accum = new THREE.WebGLRenderTarget(W, H, {
    type: floatBlend ? THREE.FloatType : THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  })
  const depthMap = new THREE.WebGLRenderTarget(resolution, resolution, {
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(resolution, resolution, THREE.UnsignedIntType),
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  })
  depthMap.depthTexture.minFilter = THREE.NearestFilter
  depthMap.depthTexture.magFilter = THREE.NearestFilter

  // Depth: both faces, so open shells (mail sleeves, linings) occlude too.
  const depthMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false })
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10)
  const viewProj = new THREE.Matrix4()
  const dir = new THREE.Vector3()
  const center = new THREE.Vector3()

  const shared = {
    uDepth: { value: depthMap.depthTexture },
    uViewProj: { value: viewProj },
    uDir: { value: dir },
    uSize: { value: new THREE.Vector2(W, H) },
    uTexel: { value: 1 / resolution },
    uBias: { value: 0 },
    uLift: { value: 0 },
  }
  const pointsMaterial = (offset) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...shared, uOffset: { value: offset } },
      vertexShader: /* glsl */ `
        uniform sampler2D uDepth;
        uniform mat4 uViewProj;
        uniform vec3 uDir;
        uniform vec2 uSize;
        uniform float uTexel;
        uniform float uBias;
        uniform float uLift;
        uniform float uOffset;
        out vec2 vTally;
        void main() {
          vec3 P = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
          vec3 N = normalize( transpose( inverse( mat3( modelMatrix ) ) ) * normal );
          float facing = max( dot( N, uDir ), 0.0 );
          vec4 clip = uViewProj * vec4( P + N * uLift, 1.0 );
          vec3 ndc = clip.xyz / clip.w;
          vec2 uv = ndc.xy * 0.5 + 0.5;
          float depth = ndc.z * 0.5 + 0.5 - uBias;
          // Four taps half a texel apart: a soft, stable verdict.
          float lit = 0.0;
          lit += step( depth, texture( uDepth, uv + vec2( -0.5, -0.5 ) * uTexel ).r );
          lit += step( depth, texture( uDepth, uv + vec2( 0.5, -0.5 ) * uTexel ).r );
          lit += step( depth, texture( uDepth, uv + vec2( -0.5, 0.5 ) * uTexel ).r );
          lit += step( depth, texture( uDepth, uv + vec2( 0.5, 0.5 ) * uTexel ).r );
          vTally = vec2( lit * 0.25 * facing, facing );
          float id = uOffset + float( gl_VertexID );
          float row = floor( id / uSize.x );
          float col = id - row * uSize.x;
          gl_Position = vec4( ( col + 0.5 ) / uSize.x * 2.0 - 1.0, ( row + 0.5 ) / uSize.y * 2.0 - 1.0, 0.0, 1.0 );
          gl_PointSize = 1.0;
        }`,
      fragmentShader: /* glsl */ `
        in vec2 vTally;
        out vec4 tally;
        void main() {
          tally = vec4( vTally, 0.0, 1.0 );
        }`,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    })

  // Saved renderer state.
  const prevTarget = renderer.getRenderTarget()
  const prevClear = renderer.getClearColor(new THREE.Color())
  const prevAlpha = renderer.getClearAlpha()
  const prevAutoClear = renderer.autoClear
  const prevShadows = renderer.shadowMap.autoUpdate

  const disposables = [accum, depthMap, depthMaterial]
  try {
    renderer.shadowMap.autoUpdate = false
    renderer.autoClear = false
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(accum)
    renderer.clear(true, false, false)

    let offset = 0
    const ranges = []
    for (const cluster of clusters) {
      // Proxies in rest-pose world space: the real geometry, drawn twice.
      const depthScene = new THREE.Scene()
      const pointScene = new THREE.Scene()
      const box = new THREE.Box3()
      for (const mesh of cluster) {
        mesh.updateWorldMatrix(true, false)
        const proxy = new THREE.Mesh(mesh.geometry, depthMaterial)
        proxy.matrixAutoUpdate = false
        proxy.matrix.copy(mesh.matrixWorld)
        proxy.frustumCulled = false
        depthScene.add(proxy)
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))

        const g = mesh.geometry
        const cloud = new THREE.BufferGeometry()
        cloud.setAttribute('position', g.attributes.position)
        cloud.setAttribute('normal', g.attributes.normal)
        const material = pointsMaterial(offset)
        const points = new THREE.Points(cloud, material)
        points.matrixAutoUpdate = false
        points.matrix.copy(mesh.matrixWorld)
        points.frustumCulled = false
        pointScene.add(points)
        disposables.push(cloud, material)
        ranges.push([mesh, offset])
        offset += g.attributes.position.count
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      center.copy(sphere.center)
      const R = sphere.radius * 1.02
      camera.left = camera.bottom = -R
      camera.right = camera.top = R
      camera.near = 0.01
      camera.far = R * 2 + 0.02
      camera.updateProjectionMatrix()
      // A texel's worth of depth, and a lift off the surface of about the
      // same size, keep every vertex from shading itself.
      const texelWorld = (2 * R) / resolution
      shared.uBias.value = (1.5 * texelWorld) / camera.far
      shared.uLift.value = texelWorld * 0.75

      for (let i = 0; i < directions; i++) {
        fibonacci(i, directions, dir)
        camera.position.copy(center).addScaledVector(dir, R + 0.01)
        camera.lookAt(center)
        camera.updateMatrixWorld()
        viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)

        renderer.setRenderTarget(depthMap)
        renderer.clear(false, true, false)
        renderer.render(depthScene, camera)
        renderer.setRenderTarget(accum)
        renderer.render(pointScene, camera)
        if (i % 8 === 7) await breathe()
      }
      await breathe()
    }

    // One read back — fenced, so the page keeps running while the GPU
    // finishes — then each mesh takes its slice.
    const pixels = floatBlend ? new Float32Array(W * H * 4) : new Uint16Array(W * H * 4)
    if (renderer.readRenderTargetPixelsAsync) await renderer.readRenderTargetPixelsAsync(accum, 0, 0, W, H, pixels)
    else renderer.readRenderTargetPixels(accum, 0, 0, W, H, pixels)
    const read = floatBlend ? (i) => pixels[i] : (i) => THREE.DataUtils.fromHalfFloat(pixels[i])
    for (const [mesh, start] of ranges) {
      const n = mesh.geometry.attributes.position.count
      // 32-bit float: WebGPU has no single-channel 8-bit vertex format.
      const ao = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const lit = read((start + i) * 4)
        const facing = read((start + i) * 4 + 1)
        const raw = facing > 1e-4 ? lit / facing : 1
        ao[i] = THREE.MathUtils.clamp(shape(raw), 0, 1)
      }
      mesh.geometry.setAttribute('ao', new THREE.BufferAttribute(ao, 1))
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(prevClear, prevAlpha)
    renderer.autoClear = prevAutoClear
    renderer.shadowMap.autoUpdate = prevShadows
    disposables.forEach((d) => d.dispose())
  }
}

/** The i-th of n points spread evenly over the unit sphere (a Fibonacci lattice). */
function fibonacci(i, n, out) {
  const y = 1 - (2 * (i + 0.5)) / n
  const r = Math.sqrt(1 - y * y)
  const a = i * 2.399963229728653
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r)
}
