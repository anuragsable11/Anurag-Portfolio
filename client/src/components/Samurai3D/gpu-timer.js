/**
 * Milliseconds the GPU spends on each frame, where the browser exposes it.
 * The quality governor uses this to judge a rung by the GPU's real load
 * rather than by frame intervals alone (a vsync-capped frame looks the same
 * whether the GPU was 20% or 90% busy).
 *
 * WebGL 2: EXT_disjoint_timer_query_webgl2, polled a frame or two later.
 * Returns null where there is no timer.
 */
export function createWebGLTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!ext) return null
  let query = null
  const queries = []
  return {
    begin() {
      if (query || queries.length > 3) return
      query = gl.createQuery()
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
    },
    end() {
      if (!query) return
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      queries.push(query)
      query = null
    },
    /** Milliseconds the GPU spent on the oldest finished frame, or null. */
    poll() {
      if (!queries.length) return null
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        queries.splice(0).forEach((q) => gl.deleteQuery(q))
        return null
      }
      const q = queries[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return null
      queries.shift()
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT)
      gl.deleteQuery(q)
      return ns / 1e6
    },
    dispose() {
      if (query) gl.endQuery(ext.TIME_ELAPSED_EXT)
      queries.forEach((q) => gl.deleteQuery(q))
      queries.length = 0
    },
  }
}
