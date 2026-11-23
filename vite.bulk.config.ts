import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// The Bulk Orders portal (2026-11-11): a second app of this repo with its own page (bulk.html -> src/bulk-main.tsx).
//   npm run dev:bulk     http://localhost:5174 (the backend's BULK_PORTAL_URL; CORS allows it)
//   npm run build:bulk   dist-bulk/index.html + assets, served at the root of its own domain (orders.mcaffeine.com,
//                        dev.orders.mcaffeine.com; bucket folder bulk-orders/). It calls the API on the POST_FG address
//                        (VITE_API_BASE_URL = the deploy's VITE_BULK_API_BASE_URL, a full https://.../postfg/api/v1).

/** Every page address of the dev server opens bulk.html; the build's bulk.html becomes index.html. */
const bulkPage = (): Plugin => ({
  name: 'bulk-page',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && req.headers.accept?.includes('text/html')) req.url = '/bulk.html'
      next()
    })
  },
  closeBundle() {
    const out = path.resolve(__dirname, 'dist-bulk')
    if (fs.existsSync(path.join(out, 'bulk.html'))) fs.renameSync(path.join(out, 'bulk.html'), path.join(out, 'index.html'))
  },
})

export default defineConfig(() => ({
  base: '/',
  plugins: [react(), tailwindcss(), bulkPage()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist-bulk', emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, 'bulk.html') } },
  server: { host: 'localhost', port: 5174, strictPort: true },
  preview: { host: 'localhost', port: 5174, strictPort: true },
}))
