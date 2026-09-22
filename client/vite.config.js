import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
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
