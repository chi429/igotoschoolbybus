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

export interface FareInfo {
  fare: number
  joint: boolean
  url: string
}

export interface DB {
  stops: Stop[]
  stopMap: Map<string, Stop> // `${co}:${id}`
  variants: Map<string, RouteVariant> // `${co}:${key}`
  stopToVariants: Map<string, { vkey: string; idx: number }[]>
  fares: Map<string, FareInfo> // `${co}:${route}`
}

/* 攞車費／官方連結：優先九巴，冇就城巴 */
export function getFare(db: DB, cos: Co[], route: string): FareInfo | null {
  for (const co of cos) {
    const f = db.fares.get(`${co}:${route}`)
    if (f) return f
  }
  return null
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
  const [kmb, ctb, rawFares] = await Promise.all([
    fetch(`${base}data/kmb.json`).then(r => r.json()) as Promise<RawData>,
    fetch(`${base}data/ctb.json`).then(r => r.json()) as Promise<RawData>,
    fetch(`${base}data/fares.json`)
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({})) as Promise<Record<string, [number, number, string]>>,
  ])
  const db: DB = {
    stops: [],
    stopMap: new Map(),
    variants: new Map(),
    stopToVariants: new Map(),
    fares: new Map(),
  }
  ingest(db, 'kmb', kmb)
  ingest(db, 'ctb', ctb)
  for (const [k, [fare, joint, url]] of Object.entries(rawFares)) {
    db.fares.set(k, { fare, joint: joint === 1, url })
  }
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

/* 站/地名 normalize：唔同營運商同一地方格式唔一致（空格/括號），
   合併聯營線時用嚟對比 */
export function normName(s: string): string {
  return s.replace(/[\s()（）,，]/g, '')
}

/* 聯營路線 group：同一號碼，方向用「起/終點站座標距離」配對
   （兩間公司總站叫法成日唔同，靠名 match 唔穩陣） */
export interface RouteGroup {
  gkey: string
  route: string
  origTC: string
  destTC: string
  cos: Co[]
  variants: RouteVariant[] // kmb 先
}

function edgeStop(db: DB, v: RouteVariant, last: boolean): Stop | null {
  const ids = v.stops
  if (last) {
    for (let i = ids.length - 1; i >= 0; i--) {
      const s = db.stopMap.get(`${v.co}:${ids[i]}`)
      if (s) return s
    }
  } else {
    for (let i = 0; i < ids.length; i++) {
      const s = db.stopMap.get(`${v.co}:${ids[i]}`)
      if (s) return s
    }
  }
  return null
}

/* 兩個 variant 起點站距離 + 終點站距離（米）；愈細愈似同一方向 */
function pairScore(db: DB, a: RouteVariant, b: RouteVariant): number {
  const a0 = edgeStop(db, a, false)
  const a1 = edgeStop(db, a, true)
  const b0 = edgeStop(db, b, false)
  const b1 = edgeStop(db, b, true)
  if (!a0 || !a1 || !b0 || !b1) return Infinity
  return distM(a0.lat, a0.lng, b0.lat, b0.lng) + distM(a1.lat, a1.lng, b1.lat, b1.lng)
}

/* 兩條 variant 終點站係咪相近（同一方向嘅信號） */
export function endsClose(db: DB, a: RouteVariant, b: RouteVariant, m = 500): boolean {
  const a1 = edgeStop(db, a, true)
  const b1 = edgeStop(db, b, true)
  return !!a1 && !!b1 && distM(a1.lat, a1.lng, b1.lat, b1.lng) < m
}

export function groupVariants(db: DB, flat: RouteVariant[]): RouteGroup[] {
  const byRoute = new Map<string, RouteVariant[]>()
  for (const v of flat) {
    const arr = byRoute.get(v.route)
    if (arr) arr.push(v)
    else byRoute.set(v.route, [v])
  }

  const out: RouteGroup[] = []
  const mk = (route: string, variants: RouteVariant[]) => {
    variants.sort((a, b) => (a.co === b.co ? 0 : a.co === 'kmb' ? -1 : 1))
    const p = variants[0]
    out.push({
      gkey: `${route}|${p.co}|${p.bound}|${normName(p.destTC)}`,
      route,
      origTC: p.origTC,
      destTC: p.destTC,
      cos: [...new Set(variants.map(v => v.co))],
      variants,
    })
  }

  for (const [route, vs] of byRoute) {
    const kmbs = vs.filter(v => v.co === 'kmb')
    const ctbs = vs.filter(v => v.co === 'ctb')
    const used = new Set<RouteVariant>()
    for (const k of kmbs) {
      let best: RouteVariant | null = null
      let bestScore = Infinity
      for (const c of ctbs) {
        if (used.has(c)) continue
        const s = pairScore(db, k, c)
        if (s < bestScore) {
          bestScore = s
          best = c
        }
      }
      if (best && bestScore < 1000) {
        used.add(best)
        mk(route, [k, best])
      } else {
        mk(route, [k])
      }
    }
    for (const c of ctbs) {
      if (!used.has(c)) mk(route, [c])
    }
  }

  return out.sort(
    (a, b) =>
      a.route.length - b.route.length ||
      a.route.localeCompare(b.route) ||
      a.gkey.localeCompare(b.gkey),
  )
}

export function searchRoutesGrouped(db: DB, q: string, max = 30): RouteGroup[] {
  return groupVariants(db, searchRoutes(db, q, 200)).slice(0, max)
}

/* ── 專線：通宵車 / 機場巴士 ── */
export type SpecialKind = 'night' | 'airport'

export function specialRoutes(db: DB, kind: SpecialKind): RouteGroup[] {
  const pred =
    kind === 'night' ? (r: string) => /^N\d/.test(r) : (r: string) => /^(A|E|S|NA)\d/.test(r)
  const best = new Map<string, RouteVariant>()
  for (const v of db.variants.values()) {
    if (!pred(v.route)) continue
    const k = `${v.co}:${v.route}:${v.bound}`
    const cur = best.get(k)
    if (!cur || +v.serviceType < +cur.serviceType) best.set(k, v)
  }
  return groupVariants(db, [...best.values()])
}

/* 條線係咪「先經由、後經去」：文字 match 站名（起/終點名都計） */
export function variantPasses(db: DB, v: RouteVariant, fromQ: string, toQ: string): boolean {
  const f = fromQ.trim()
  const t = toQ.trim()
  if (!f && !t) return true
  const match = (sid: string, q: string) => {
    const s = db.stopMap.get(`${v.co}:${sid}`)
    return !!s && (s.nameTC.includes(q) || s.nameEN.toLowerCase().includes(q.toLowerCase()))
  }
  let fi = -1
  if (f) {
    if (v.origTC.includes(f)) fi = 0
    else {
      fi = v.stops.findIndex(id => match(id, f))
      if (fi < 0) return false
    }
  }
  if (t) {
    if (v.destTC.includes(t)) return true
    for (let i = fi < 0 ? 0 : fi + 1; i < v.stops.length; i++) {
      if (match(v.stops[i], t)) return true
    }
    return false
  }
  return true
}

/* ── 地點搜尋：同名相近車站 group 埋一齊 ── */
export interface StopGroup {
  name: string
  stops: Stop[]
}

export function searchStopGroups(db: DB, q: string, max = 8): StopGroup[] {
  const raw = q.trim()
  const query = raw.toLowerCase()
  if (!raw) return []
  const groups = new Map<string, { g: StopGroup; score: number }>()
  for (const s of db.stops) {
    const tc = s.nameTC
    const en = s.nameEN.toLowerCase()
    let score = -1
    if (tc.startsWith(raw) || en.startsWith(query)) score = 0
    else if (tc.includes(raw) || en.includes(query)) score = 1
    if (score < 0) continue
    const name = tc.split(',')[0]
    const cell = `${name}|${Math.round(s.lat * 90)}|${Math.round(s.lng * 90)}`
    const sc = score * 1000 + name.length
    const cur = groups.get(cell)
    if (cur) {
      cur.g.stops.push(s)
      cur.score = Math.min(cur.score, sc)
    } else {
      groups.set(cell, { g: { name, stops: [s] }, score: sc })
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(x => x.g)
}

/* 呢堆站有咩路線號（俾搜尋結果預覽用） */
export function routeNumbersAtStops(db: DB, stops: Stop[]): string[] {
  const set = new Set<string>()
  for (const s of stops) {
    for (const { vkey } of db.stopToVariants.get(`${s.co}:${s.id}`) ?? []) {
      const v = db.variants.get(vkey)
      if (v) set.add(v.route)
    }
  }
  return [...set].sort((a, b) => a.length - b.length || a.localeCompare(b))
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
