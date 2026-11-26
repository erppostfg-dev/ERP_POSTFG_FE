import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import Login from './pages/Login'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { PATHS } from './constants/pages'
import { QUERY_CACHE } from './constants/ui'
import './index.css'
import { blockNumberStepping } from './lib/numberInputs'
import { ErrorBoundary } from './components/ErrorBoundary'
import { reloadOnStaleChunks } from './lib/staleChunks'
import { initTheme } from './lib/theme'

// Number boxes change only by typing (no wheel / arrow-key stepping).
blockNumberStepping()
// After a deploy an old tab reloads once instead of a white screen (2026-11-24).
reloadOnStaleChunks()
// Light / dark mode as this browser chose it (2026-11-26).
initTheme()

// The frontend data cache (TanStack Query): pages show what they loaded before at once and refresh it quietly.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: QUERY_CACHE.STALE_MS, gcTime: QUERY_CACHE.GC_MS, retry: QUERY_CACHE.RETRY, refetchOnWindowFocus: false },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary scope="app">
    <QueryClientProvider client={queryClient}>
      {/* BASE_URL is Vite's `base`: /postfg/ in builds, / in dev. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <AuthProvider>
          <Routes>
            <Route path={PATHS.LOGIN} element={<Login />} />
            <Route path="*" element={<RequireAuth><App /></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)