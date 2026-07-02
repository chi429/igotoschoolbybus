// Smoke test: point-to-point search + live ETA, run with:
// node --experimental-strip-types scripts/smoke-test.mts
import { readFileSync } from 'node:fs'
import { ingest, searchStops, type DB } from '../src/lib/data.ts'
import { findJourneys, fetchEta } from '../src/lib/journey.ts'

const db: DB = { stops: [], stopMap: new Map(), variants: new Map(), stopToVariants: new Map() }
ingest(db, 'kmb', JSON.parse(readFileSync('public/data/kmb.json', 'utf8')))
ingest(db, 'ctb', JSON.parse(readFileSync('public/data/ctb.json', 'utf8')))
console.log(`DB: ${db.stops.length} stops, ${db.variants.size} variants`)

const from = searchStops(db, '太子站')[0]
const to = searchStops(db, '尖沙咀碼頭')[0]
console.log('from:', from, '\nto:', to)

const journeys = findJourneys(db, from, to)
console.log(`\n${journeys.length} direct routes found:`)
for (const j of journeys.slice(0, 8)) {
  console.log(`  [${j.co.toUpperCase()}] ${j.route} 往${j.destTC} — 上車:${j.board.nameTC}(行${j.walkToBoard}m) 落車:${j.alight.nameTC} (${j.numStops}個站)`)
}

const eta = await fetchEta(journeys[0])
console.log(`\nETA for ${journeys[0].route} @ ${journeys[0].board.nameTC}:`, eta)
