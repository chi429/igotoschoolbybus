// Snapshot KMB + Citybus static data into public/data/*.json
// Run: node scripts/fetch-data.mjs [kmb|ctb-routes|ctb-stops|all]
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'data')
mkdirSync(outDir, { recursive: true })

const get = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${r.status}`)
      return (await r.json()).data
    } catch (e) {
      if (i === retries - 1) throw new Error(`${url}: ${e.message}`)
      await new Promise(res => setTimeout(res, 500 * (i + 1)))
    }
  }
}

const pool = async (items, fn, size = 40) => {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }))
  return out
}

const stage = process.argv[2] || 'all'

// ---------- KMB (bulk endpoints) ----------
if (stage === 'kmb' || stage === 'all') {
console.log('KMB: routes, stops, route-stops...')
const [kmbRoutes, kmbStops, kmbRS] = await Promise.all([
  get('https://data.etabus.gov.hk/v1/transport/kmb/route/'),
  get('https://data.etabus.gov.hk/v1/transport/kmb/stop'),
  get('https://data.etabus.gov.hk/v1/transport/kmb/route-stop'),
])

const kmb = { routes: {}, stops: {}, routeStops: {} }
for (const r of kmbRoutes) {
  kmb.routes[`${r.route}|${r.bound}|${r.service_type}`] = [r.orig_tc, r.dest_tc, r.orig_en, r.dest_en]
}
for (const s of kmbStops) {
  kmb.stops[s.stop] = [s.name_tc, s.name_en, +(+s.lat).toFixed(5), +(+s.long).toFixed(5)]
}
for (const rs of kmbRS) {
  const k = `${rs.route}|${rs.bound}|${rs.service_type}`
  ;(kmb.routeStops[k] ??= [])[+rs.seq - 1] = rs.stop
}
writeFileSync(join(outDir, 'kmb.json'), JSON.stringify(kmb))
console.log(`KMB done: ${Object.keys(kmb.routes).length} route variants, ${Object.keys(kmb.stops).length} stops`)
}

// ---------- Citybus (per-route endpoints) ----------
if (stage === 'ctb-routes' || stage === 'all') {
console.log('CTB: route list...')
const ctbRoutes = await get('https://rt.data.gov.hk/v2/transport/citybus/route/CTB')
const ctb = { routes: {}, stops: {}, routeStops: {} }

const dirMap = { outbound: 'O', inbound: 'I' }
const tasks = []
for (const r of ctbRoutes) {
  for (const dir of ['outbound', 'inbound']) {
    tasks.push({ route: r.route, dir, r })
  }
}
console.log(`CTB: fetching route-stops for ${ctbRoutes.length} routes...`)
await pool(tasks, async ({ route, dir, r }) => {
  const data = await get(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route}/${dir}`)
  if (!data?.length) return
  const k = `${route}|${dirMap[dir]}|1`
  ctb.routeStops[k] = data.sort((a, b) => a.seq - b.seq).map(s => s.stop)
  // orig/dest flip for inbound
  ctb.routes[k] = dir === 'outbound'
    ? [r.orig_tc, r.dest_tc, r.orig_en, r.dest_en]
    : [r.dest_tc, r.orig_tc, r.dest_en, r.orig_en]
}, 60)
writeFileSync(join(outDir, 'ctb-partial.json'), JSON.stringify(ctb))
console.log(`CTB route-stops done: ${Object.keys(ctb.routes).length} variants`)
}

if (stage === 'ctb-stops' || stage === 'all') {
const ctb2 = JSON.parse(readFileSync(join(outDir, 'ctb-partial.json'), 'utf8'))
const stopIds = [...new Set(Object.values(ctb2.routeStops).flat())]
console.log(`CTB: fetching ${stopIds.length} stops...`)
await pool(stopIds, async id => {
  const s = await get(`https://rt.data.gov.hk/v2/transport/citybus/stop/${id}`)
  if (s?.stop) ctb2.stops[id] = [s.name_tc, s.name_en, +(+s.lat).toFixed(5), +(+s.long).toFixed(5)]
}, 60)
writeFileSync(join(outDir, 'ctb.json'), JSON.stringify(ctb2))
console.log(`CTB done: ${Object.keys(ctb2.routes).length} route variants, ${Object.keys(ctb2.stops).length} stops`)
}
