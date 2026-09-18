import type { MatchRecord } from './store.ts'

type Socket = {
  send: (data: string) => void
  on: (event: string, cb: () => void) => void
  readyState: number
}

export class Hub {
  private rooms = new Map<string, Set<Socket>>()

  join(code: string, socket: Socket): void {
    const key = code.toUpperCase()
    let set = this.rooms.get(key)
    if (!set) {
      set = new Set()
      this.rooms.set(key, set)
    }
    set.add(socket)
    socket.on('close', () => this.leave(key, socket))
  }

  leave(code: string, socket: Socket): void {
    const set = this.rooms.get(code.toUpperCase())
    if (!set) return
    set.delete(socket)
    if (set.size === 0) this.rooms.delete(code.toUpperCase())
  }

  broadcast(code: string, record: MatchRecord): void {
    const payload = JSON.stringify({
      type: 'match',
      state: record.state,
      events: record.events,
    })
    const set = this.rooms.get(code.toUpperCase())
    if (!set) return
    for (const socket of set) {
      if (socket.readyState === 1) socket.send(payload)
    }
  }
}
