import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// La versión de package.json llega a la app (pantalla de novedades y Ajustes)
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  server: {
    host: true,
    port: 5173,
    // En desarrollo, /push/* va al servicio push corriendo localmente (cd push-service && npm start)
    proxy: {
      '/push': process.env.PUSH_DEV_URL || 'http://localhost:8080'
    }
  }
})

