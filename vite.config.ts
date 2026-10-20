import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // En desarrollo, /push/* va al servicio push corriendo localmente (cd push-service && npm start)
    proxy: {
      '/push': process.env.PUSH_DEV_URL || 'http://localhost:8080'
    }
  }
})

