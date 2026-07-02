import {
  nearbyStops,
  normName,
  distM,
  endsClose,
  type Co,
  type DB,
  type Stop,
  type Place,
  type RouteVariant,
} from './data.ts'

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

export async function fetchStopEta(
  co: 'kmb' | 'ctb',
  stopId: string,
  route: string,
  serviceType: string,
  bound: string,
): Promise<EtaInfo> {
  const now = Date.now()
  let rows: { dir: string; eta: string | null; rmk_tc: string }[] = []
  try {
    if (co === 'kmb') {
      const r = await fetch(
        `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/${serviceType}`,
      )
      rows = ((await r.json()).data ?? []) as KmbEta[]
    } else {
      const r = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`)
      rows = ((await r.json()).data ?? []) as CtbEta[]
    }
  } catch {
    return { mins: [], rmk: '未能讀取' }
  }
  const dirRows = rows.filter(e => e.dir === bound)
  const mins = dirRows
    .filter(e => e.eta)
    .map(e => Math.round((new Date(e.eta!).getTime() - now) / 60000))
    .filter(m => m > -2)
    .slice(0, 3)
  const rmk = dirRows.find(e => e.rmk_tc)?.rmk_tc ?? ''
  return { mins, rmk }
}

export function fetchEta(j: Journey): Promise<EtaInfo> {
  return fetchStopEta(j.co, j.board.id, j.route, j.serviceType, j.bound)
}

/* ── 聯營路線合併 ──
   同一號碼 + 同一目的地（normalize 後）視為同一條線，
   合併做一張卡；ETA 兩間公司各自上車站一齊攞再排序。 */
export interface JourneyGroup {
  id: string
  route: string
  destTC: string
  cos: Co[]
  legs: Journey[]
  board: Stop
  alight: Stop
  numStops: number
  walkToBoard: number
}

export function groupJourneys(journeys: Journey[]): JourneyGroup[] {
  // 先按號碼分，再喺號碼內 cluster：目的地名一樣，或者落車站相距 <500 米
  const byRoute = new Map<string, Journey[]>()
  for (const j of journeys) {
    const arr = byRoute.get(j.route)
    if (arr) arr.push(j)
    else byRoute.set(j.route, [j])
  }
  const clusters: Journey[][] = []
  for (const legs of byRoute.values()) {
    const local: Journey[][] = []
    for (const j of legs) {
      const hit = local.find(arr => {
        const p = arr[0]
        return (
          normName(p.destTC) === normName(j.destTC) ||
          distM(p.alight.lat, p.alight.lng, j.alight.lat, j.alight.lng) < 500
        )
      })
      if (hit) hit.push(j)
      else local.push([j])
    }
    clusters.push(...local)
  }
  return clusters.map(legs => {
    // 行得最少嗰程做主 leg（卡面顯示佢嘅上落車站）
    legs.sort((a, b) => a.walkToBoard - b.walkToBoard)
    const p = legs[0]
    return {
      id: legs.map(l => l.id).join('+'),
      route: p.route,
      destTC: p.destTC,
      cos: [...new Set(legs.map(l => l.co))].sort((a, b) => (a === 'kmb' ? -1 : b === 'kmb' ? 1 : 0)),
      legs,
      board: p.board,
      alight: p.alight,
      numStops: p.numStops,
      walkToBoard: p.walkToBoard,
    }
  })
}

export async function fetchGroupEta(g: JourneyGroup): Promise<EtaInfo> {
  const infos = await Promise.all(g.legs.map(fetchEta))
  const mins = infos
    .flatMap(i => i.mins)
    .sort((a, b) => a - b)
    .slice(0, 3)
  const rmk = infos.find(i => i.rmk)?.rmk ?? ''
  return { mins, rmk }
}

/* ── 車站詳情：一個站（同名 group）有咩路線經過 ──
   聯營一樣合併：同號碼、唔同公司、目的地名同或者終點站相近 */
export interface StopRouteRow {
  id: string
  route: string
  destTC: string
  cos: Co[]
  legs: { v: RouteVariant; stopId: string }[]
}

export function routesAtStopGroup(db: DB, stops: Stop[]): StopRouteRow[] {
  const best = new Map<string, { v: RouteVariant; stopId: string }>()
  for (const s of stops) {
    for (const { vkey } of db.stopToVariants.get(`${s.co}:${s.id}`) ?? []) {
      const v = db.variants.get(vkey)
      if (!v) continue
      const k = `${v.co}:${v.route}:${v.bound}`
      const cur = best.get(k)
      if (!cur || +v.serviceType < +cur.v.serviceType) best.set(k, { v, stopId: s.id })
    }
  }
  const byRoute = new Map<string, { v: RouteVariant; stopId: string }[]>()
  for (const leg of best.values()) {
    const arr = byRoute.get(leg.v.route)
    if (arr) arr.push(leg)
    else byRoute.set(leg.v.route, [leg])
  }
  const rows: StopRouteRow[] = []
  for (const [route, legs] of byRoute) {
    const clusters: { v: RouteVariant; stopId: string }[][] = []
    for (const leg of legs) {
      const hit = clusters.find(c => {
        const p = c[0].v
        if (p.co === leg.v.co) return false
        return normName(p.destTC) === normName(leg.v.destTC) || endsClose(db, p, leg.v)
      })
      if (hit) hit.push(leg)
      else clusters.push([leg])
    }
    for (const c of clusters) {
      c.sort((a, b) => (a.v.co === b.v.co ? 0 : a.v.co === 'kmb' ? -1 : 1))
      const p = c[0]
      rows.push({
        id: c.map(x => `${x.v.co}:${x.v.key}`).join('+'),
        route,
        destTC: p.v.destTC,
        cos: [...new Set(c.map(x => x.v.co))],
        legs: c,
      })
    }
  }
  return rows.sort((a, b) => a.route.length - b.route.length || a.route.localeCompare(b.route))
}

export async function fetchStopRowEta(row: StopRouteRow): Promise<EtaInfo> {
  const infos = await Promise.all(
    row.legs.map(l => fetchStopEta(l.v.co, l.stopId, l.v.route, l.v.serviceType, l.v.bound)),
  )
  const mins = infos
    .flatMap(i => i.mins)
    .sort((a, b) => a - b)
    .slice(0, 3)
  const rmk = infos.find(i => i.rmk)?.rmk ?? ''
  return { mins, rmk }
}
