import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BulkApp from './pages/bulk/BulkApp'
import { QUERY_CACHE } from './constants/ui'
import './index.css'
import { blockNumberStepping } from './lib/numberInputs'

/*
 * The Bulk Orders portal's own entry (2026-11-11): bulk.html -> here. Built and served apart from POST_FG
 * (`npm run dev:bulk` on :5174, `npm run build:bulk` -> dist-bulk/ for <domain>/bulk-orders/). It never loads a
 * POST_FG page; it shares only the API client, the UI kit and the styles.
 */

blockNumberStepping()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: QUERY_CACHE.STALE_MS, gcTime: QUERY_CACHE.GC_MS, retry: QUERY_CACHE.RETRY, refetchOnWindowFocus: false },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BulkApp />
    </QueryClientProvider>
  </React.StrictMode>,
)
