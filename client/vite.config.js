import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Allow overriding API target via env for local dev
const target = process.env.VITE_API_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        secure: false,
      },
      '/hubs': {
        target,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
