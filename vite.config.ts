import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// La versión de package.json llega a la app (pantalla de novedades y Ajustes)
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // version.json: la app instalada lo consulta para saber si hay una versión nueva y ofrecer recargar
    {
      name: 'itpocket-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) })
      }
    }
  ],
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

