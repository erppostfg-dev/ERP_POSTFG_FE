import { inventoryFromSheet35 } from './sheet35'

/* Works out Inventory Calculation's rows off the page's thread (Sheet35(2) is tens of MB). */

self.onmessage = (e: MessageEvent<{ id: number; text: string }>) => {
  try {
    const out = inventoryFromSheet35(e.data.text)
    self.postMessage({ id: e.data.id, ...out })
  } catch (err) {
    self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) })
  }
}
