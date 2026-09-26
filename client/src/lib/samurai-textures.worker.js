// Builds the samurai's surface maps off the main thread and hands the pixel
// buffers back without copying them.
import { generateTextures } from './samurai-textures.js'

self.onmessage = (e) => {
  const maps = generateTextures(e.data?.quality)
  self.postMessage(
    maps,
    Object.values(maps).map((m) => m.data.buffer)
  )
}
