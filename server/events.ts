import type { Response } from 'express'
import type { ServerEvent } from '../src/lib/types'

/** Server-Sent Events: every signed-in tab keeps one stream open. */
const streams = new Map<string, Set<Response>>()

export function addStream(userId: string, res: Response) {
  let set = streams.get(userId)
  if (!set) streams.set(userId, (set = new Set()))
  set.add(res)
  return () => {
    set!.delete(res)
    if (!set!.size) streams.delete(userId)
  }
}

export function emit(userIds: Iterable<string>, event: ServerEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const id of new Set(userIds)) for (const res of streams.get(id) ?? []) res.write(data)
}

/** Tell clients their data changed so they refetch. */
export const sync = (userIds: Iterable<string>) => emit(userIds, { type: 'sync' })

/** Everyone online — used when a new ride is published so search results refresh. */
export const broadcastSync = () => emit(streams.keys(), { type: 'sync' })

setInterval(() => {
  for (const set of streams.values()) for (const res of set) res.write(': ping\n\n')
}, 10_000).unref()
