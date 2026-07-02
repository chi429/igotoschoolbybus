import { nearbyStops, type DB, type Stop, type Place } from './data.ts'

export interface Journey {
  id: string
  co: 'kmb' | 'ctb'
  route: string
  bound: string
  serviceType: string
  destTC: string
  destEN: string
  board: Stop
  alight: Stop
  numStops: number
  walkToBoard: number
  walkFromAlight: number
}

export interface EtaInfo {
  mins: number[]
  rmk: string
}

export function findJourneys(db: DB, from: Place, to: Place): Journey[] {
  const origins = nearbyStops(db, from.lat, from.lng, 500)
  const dests = nearbyStops(db, to.lat, to.lng, 500)

  // best origin occurrence per variant (nearest walk, then earliest in sequence)
  const oBest = new Map<string, { stop: Stop; idx: number; dist: number }>()
  for (const { stop, dist } of origins) {
    for (const { vkey, idx } of db.stopToVariants.get(`${stop.co}:${stop.id}`) ?? []) {
      const cur = oBest.get(vkey)
      if (!cur || dist < cur.dist - 1 || (Math.abs(dist - cur.dist) <= 1 && idx < cur.idx)) {
        oBest.set(vkey, { stop, idx, dist })
      }
    }
  }

  const journeys: Journey[] = []
  const dSeen = new Map<string, { stop: Stop; idx: number; dist: number }>()
  for (const { stop, dist } of dests) {
    for (const { vkey, idx } of db.stopToVariants.get(`${stop.co}:${stop.id}`) ?? []) {
      const o = oBest.get(vkey)
      if (!o || idx <= o.idx) continue
      const cur = dSeen.get(vkey)
      if (!cur || dist < cur.dist) dSeen.set(vkey, { stop, idx, dist })
    }
  }

  for (const [vkey, d] of dSeen) {
    const v = db.variants.get(vkey)!
    const o = oBest.get(vkey)!
    journeys.push({
      id: vkey,
      co: v.co,
      route: v.route,
      bound: v.bound,
      serviceType: v.serviceType,
      destTC: v.destTC,
      destEN: v.destEN,
      board: o.stop,
      alight: d.stop,
      numStops: d.idx - o.idx,
      walkToBoard: Math.round(o.dist),
      walkFromAlight: Math.round(d.dist),
    })
  }

  // dedupe by co+route+bound → keep lowest service_type (main service)
  const byRoute = new Map<string, Journey>()
  for (const j of journeys) {
    const k = `${j.co}:${j.route}:${j.bound}`
    const cur = byRoute.get(k)
    if (!cur || +j.serviceType < +cur.serviceType) byRoute.set(k, j)
  }
  return [...byRoute.values()]
}

interface KmbEta {
  dir: string
  eta: string | null
  rmk_tc: string
}
interface CtbEta {
  dir: string
  eta: string | null
  rmk_tc: string
}

export async function fetchEta(j: Journey): Promise<EtaInfo> {
  const now = Date.now()
  let rows: { dir: string; eta: string | null; rmk_tc: string }[] = []
  try {
    if (j.co === 'kmb') {
      const r = await fetch(
        `https://data.etabus.gov.hk/v1/transport/kmb/eta/${j.board.id}/${j.route}/${j.serviceType}`,
      )
      rows = ((await r.json()).data ?? []) as KmbEta[]
    } else {
      const r = await fetch(
        `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${j.board.id}/${j.route}`,
      )
      rows = ((await r.json()).data ?? []) as CtbEta[]
    }
  } catch {
    return { mins: [], rmk: '未能讀取' }
  }
  const dirRows = rows.filter(e => e.dir === j.bound)
  const mins = dirRows
    .filter(e => e.eta)
    .map(e => Math.round((new Date(e.eta!).getTime() - now) / 60000))
    .filter(m => m > -2)
    .slice(0, 3)
  const rmk = dirRows.find(e => e.rmk_tc)?.rmk_tc ?? ''
  return { mins, rmk }
}
