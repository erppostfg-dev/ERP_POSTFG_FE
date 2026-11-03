import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// Vite config — https://vitejs.dev/config/
// Port 5173 is the only origin the backend's CORS allows (FRONTEND_ORIGIN), so it must not drift to another port.
//
// `npm run dev`      localhost only; the app calls the backend at VITE_API_BASE_URL (http://localhost:3000/api/v1).
// `npm run dev:lan`  office network (2026-10-16): https on LAN_HOST (e.g. 192-168-30-160.nip.io, from .env.lan) with the
//                    certificate in certs/ (git-ignored); the app calls /api/v1 and Vite forwards /api to the local
//                    backend, so colleagues reach one address and Google sign-in gets an https return URL.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const lan = mode === 'lan'
  const backend = env.LAN_BACKEND_URL || 'http://localhost:3000'

  return {
    // Deployed builds live at <domain>/postfg/ (nginx → CloudFront); dev and dev:lan stay at /.
    base: command === 'build' ? '/postfg/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: lan
      ? {
          host: '0.0.0.0',
          port: 5173,
          strictPort: true,
          allowedHosts: [env.LAN_HOST],
          https: {
            cert: fs.readFileSync(path.resolve(__dirname, 'certs/lan-cert.pem')),
            key: fs.readFileSync(path.resolve(__dirname, 'certs/lan-key.pem')),
          },
          // xfwd: the backend records the colleague's IP (x-forwarded-for), not the proxy's.
          proxy: { '/api': { target: backend, changeOrigin: false, xfwd: true } },
        }
      : { host: 'localhost', port: 5173, strictPort: true },
    preview: { host: 'localhost', port: 5173, strictPort: true },
  }
})