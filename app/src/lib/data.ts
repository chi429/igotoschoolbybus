export type Co = 'kmb' | 'ctb'

export interface Stop {
  co: Co
  id: string
  nameTC: string
  nameEN: string
  lat: number
  lng: number
}

export interface RouteVariant {
  co: Co
  key: string // route|bound|serviceType
  route: string
  bound: string
  serviceType: string
  origTC: string
  destTC: string
  origEN: string
  destEN: string
  stops: string[] // stop ids in sequence
}

export interface RawData {
  routes: Record<string, [string, string, string, string]>
  stops: Record<string, [string, string, number, number]>
  routeStops: Record<string, string[]>
}

export interface DB {
  stops: Stop[]
  stopMap: Map<string, Stop> // `${co}:${id}`
  variants: Map<string, RouteVariant> // `${co}:${key}`
  stopToVariants: Map<string, { vkey: string; idx: number }[]>
}

export function ingest(db: DB, co: Co, raw: RawData) {
  for (const [id, [tc, en, lat, lng]] of Object.entries(raw.stops)) {
    const s: Stop = { co, id, nameTC: tc, nameEN: en, lat, lng }
    db.stops.push(s)
    db.stopMap.set(`${co}:${id}`, s)
  }
  for (const [key, seq] of Object.entries(raw.routeStops)) {
    const meta = raw.routes[key]
    if (!meta) continue
    const [route, bound, serviceType] = key.split('|')
    const vkey = `${co}:${key}`
    db.variants.set(vkey, {
      co, key, route, bound, serviceType,
      origTC: meta[0], destTC: meta[1], origEN: meta[2], destEN: meta[3],
      stops: seq,
    })
    seq.forEach((stopId, idx) => {
      if (!stopId) return
      const sk = `${co}:${stopId}`
      let arr = db.stopToVariants.get(sk)
      if (!arr) db.stopToVariants.set(sk, (arr = []))
      arr.push({ vkey, idx })
    })
  }
}

export async function loadDB(): Promise<DB> {
  const base = import.meta.env.BASE_URL
  const [kmb, ctb] = (await Promise.all([
    fetch(`${base}data/kmb.json`).then(r => r.json()),
    fetch(`${base}data/ctb.json`).then(r => r.json()),
  ])) as RawData[]
  const db: DB = { stops: [], stopMap: new Map(), variants: new Map(), stopToVariants: new Map() }
  ingest(db, 'kmb', kmb)
  ingest(db, 'ctb', ctb)
  return db
}

const R = 6371000
export function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function nearbyStops(db: DB, lat: number, lng: number, radius = 500, max = 24) {
  const out: { stop: Stop; dist: number }[] = []
  for (const s of db.stops) {
    // cheap bounding box first (~0.0045 deg ≈ 500m)
    if (Math.abs(s.lat - lat) > 0.006 || Math.abs(s.lng - lng) > 0.006) continue
    const d = distM(lat, lng, s.lat, s.lng)
    if (d <= radius) out.push({ stop: s, dist: d })
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, max)
}

export interface Place {
  label: string
  lat: number
  lng: number
}

export function searchRoutes(db: DB, q: string, max = 30): RouteVariant[] {
  const query = q.trim().toUpperCase()
  if (!query) return []
  // dedupe by co+route+bound, keep main service (lowest service_type)
  const best = new Map<string, RouteVariant>()
  for (const v of db.variants.values()) {
    if (!v.route.startsWith(query)) continue
    const k = `${v.co}:${v.route}:${v.bound}`
    const cur = best.get(k)
    if (!cur || +v.serviceType < +cur.serviceType) best.set(k, v)
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        a.route.length - b.route.length ||
        a.route.localeCompare(b.route) ||
        a.co.localeCompare(b.co) ||
        a.bound.localeCompare(b.bound),
    )
    .slice(0, max)
}

export function searchStops(db: DB, q: string, max = 12): Place[] {
  const query = q.trim().toLowerCase()
  if (query.length < 1) return []
  const scored: { p: Place; score: number }[] = []
  const seen = new Set<string>()
  for (const s of db.stops) {
    const tc = s.nameTC
    const en = s.nameEN.toLowerCase()
    let score = -1
    if (tc.startsWith(q) || en.startsWith(query)) score = 0
    else if (tc.includes(q) || en.includes(query)) score = 1
    if (score < 0) continue
    // dedupe same-name stops within ~1km grid cell
    const cell = `${tc}|${Math.round(s.lat * 90)}|${Math.round(s.lng * 90)}`
    if (seen.has(cell)) continue
    seen.add(cell)
    scored.push({ p: { label: tc, lat: s.lat, lng: s.lng }, score: score * 1000 + tc.length })
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(x => x.p)
}
