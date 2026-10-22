import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (file) => fileURLToPath(new URL(file, import.meta.url))

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // three.js alone is ~530kB. It sits in its own lazily-loaded chunk, so
    // it never blocks first paint — raise the warning past it deliberately.
    // The samurai's WebGPU renderer (~710kB) is lazier still: only browsers
    // that draw him with WebGPU ever fetch it.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      // Two pages: the portfolio, and every project on one sphere.
      input: isSsrBuild
        ? undefined
        : { main: page('./index.html'), projects: page('./projects.html') },
      output: {
        // Keep the heavy vendor libraries in their own long-lived chunks.
        // An SSR build externalises react, which cannot then be chunked.
        manualChunks: isSsrBuild
          ? undefined
          : {
              react: ['react', 'react-dom'],
              motion: ['framer-motion'],
            },
      },
    },
  },
}))
