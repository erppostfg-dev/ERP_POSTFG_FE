import { useQuery } from '@tanstack/react-query'
import { listChannelCustomers } from '../api/masters'

/**
 * Every active channel name (master_channels), for channel filters (user, 2026-10-19: the filter showed only the
 * channels of the rows loaded, e.g. Amazon / Blinkit, not Zepto / FirstCry). Merged with the names in the rows, so a
 * channel still shows if the list can't be read (no Masters access, backend down): the filter then works as before.
 */
export function useChannelOptions(rowChannels: readonly string[]): string[] {
  const all = useQuery({
    queryKey: ['masters', 'channel-names'],
    queryFn: ({ signal }) => listChannelCustomers(signal).then((items) => items.filter((c) => c.isActive).map((c) => c.displayName)),
    retry: false,
    staleTime: 10 * 60_000,
  }).data ?? []
  return [...new Set([...all, ...rowChannels.filter(Boolean)])].sort((a, b) => a.localeCompare(b))
}
