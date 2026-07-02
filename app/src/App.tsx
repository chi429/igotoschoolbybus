import { useEffect, useMemo, useRef, useState } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import {
  loadDB,
  searchStops,
  searchRoutes,
  type DB,
  type Place,
  type RouteVariant,
} from './lib/data.ts'
import { findJourneys, fetchEta, fetchStopEta, type Journey, type EtaInfo } from './lib/journey.ts'

const CO_NAME: Record<string, string> = { kmb: '九巴', ctb: '城巴' }

interface Fav {
  from: Place
  to: Place
}

function RouteBadge({ co, route, size = 'text-sm' }: { co: string; route: string; size?: string }) {
  return (
    <span
      className={`font-num px-2 py-1.5 ${size}`}
      style={{ background: `var(--co-${co}-bg)`, color: `var(--co-${co}-fg)` }}
    >
      {route}
    </span>
  )
}

function usePlaceInput(db: DB | null) {
  const [place, setPlace] = useState<Place | null>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const suggestions = useMemo(
    () => (db && open && text && !place ? searchStops(db, text) : []),
    [db, text, open, place],
  )
  return { place, setPlace, text, setText, open, setOpen, suggestions }
}

type PlaceInput = ReturnType<typeof usePlaceInput>

function LocationField(props: {
  input: PlaceInput
  placeholder: string
  onGps?: () => void
  gpsBusy?: boolean
}) {
  const { input, placeholder, onGps, gpsBusy } = props
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <div className="pcard flex items-center gap-2 px-3 focus-within:border-accent">
        <input
          ref={ref}
          value={input.place ? input.place.label : input.text}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none placeholder:text-muted"
          onFocus={() => input.setOpen(true)}
          onBlur={() => setTimeout(() => input.setOpen(false), 150)}
          onChange={e => {
            input.setPlace(null)
            input.setText(e.target.value)
            input.setOpen(true)
          }}
        />
        {(input.place || input.text) && (
          <button
            className="text-muted hover:text-ink"
            onClick={() => {
              input.setPlace(null)
              input.setText('')
              ref.current?.focus()
            }}
            aria-label="清除"
          >
            ✕
          </button>
        )}
        {onGps && (
          <button
            onClick={onGps}
            disabled={gpsBusy}
            className="shrink-0 px-1.5 py-1 text-lg disabled:animate-pulse"
            title="用現在位置"
          >
            📍
          </button>
        )}
      </div>
      {input.suggestions.length > 0 && (
        <ul className="pcard absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-auto">
          {input.suggestions.map((p, i) => (
            <li key={i} className="border-b-2 border-line/30 last:border-b-0">
              <button
                className="w-full px-3 py-2.5 text-left text-[15px] hover:bg-paper"
                onMouseDown={() => {
                  input.setPlace(p)
                  input.setText('')
                  input.setOpen(false)
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EtaBadge({ mins }: { mins: number }) {
  if (mins <= 0) {
    return <span className="led-blink font-num text-base text-led">即到</span>
  }
  return (
    <span className="flex items-baseline gap-1">
      <span className={`font-num text-2xl ${mins <= 3 ? 'text-led' : 'text-accent'}`}>{mins}</span>
      <span className="text-xs text-muted">分</span>
    </span>
  )
}

function BusLoading({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto max-w-60 overflow-hidden border-b-2 border-line">
        <div className="bus-drive w-fit py-1 text-2xl">🚌</div>
      </div>
      <p className="mt-3 text-sm text-muted">{label}</p>
    </div>
  )
}

function RouteDetail({ db, v, onBack }: { db: DB; v: RouteVariant; onBack: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [eta, setEta] = useState<EtaInfo | null>(null)
  const reqRef = useRef(0)

  const toggle = async (idx: number, stopId: string) => {
    if (expanded === idx) {
      setExpanded(null)
      return
    }
    const req = ++reqRef.current
    setExpanded(idx)
    setEta(null)
    const e = await fetchStopEta(v.co, stopId, v.route, v.serviceType, v.bound)
    if (reqRef.current === req) setEta(e)
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} className="pbtn px-2.5 py-1.5 text-sm">
          ← 返去
        </button>
        <RouteBadge co={v.co} route={v.route} />
        <span className="min-w-0 truncate text-sm">
          往{v.destTC} <span className="text-muted">· {CO_NAME[v.co]}</span>
        </span>
      </div>
      <ol className="pcard">
        {v.stops.map((stopId, idx) => {
          const s = db.stopMap.get(`${v.co}:${stopId}`)
          if (!s) return null
          const open = expanded === idx
          return (
            <li key={idx} className="border-b-2 border-line/30 last:border-b-0">
              <button
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${open ? 'bg-paper' : ''}`}
                onClick={() => toggle(idx, stopId)}
              >
                <span className="font-num w-7 shrink-0 text-right text-xs text-muted">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px]">{s.nameTC.split(',')[0]}</span>
                {open && !eta && <span className="text-sm text-muted">…</span>}
                {open && eta && eta.mins.length === 0 && (
                  <span className="text-xs text-muted">{eta.rmk || '暫無班次'}</span>
                )}
                {open && eta && eta.mins.length > 0 && (
                  <span className="flex items-center gap-2">
                    <EtaBadge mins={eta.mins[0]} />
                    {eta.mins.length > 1 && (
                      <span className="text-xs text-muted">之後 {eta.mins.slice(1).join(', ')} 分</span>
                    )}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FavRow(props: { db: DB; fav: Fav; onGo: () => void; onRemove: () => void }) {
  const { db, fav, onGo, onRemove } = props
  const [etas, setEtas] = useState<Record<string, EtaInfo>>({})

  const journeys = useMemo(() => findJourneys(db, fav.from, fav.to), [db, fav])

  useEffect(() => {
    if (journeys.length === 0) return
    let cancelled = false
    const load = async () => {
      const results = await Promise.all(journeys.map(j => fetchEta(j)))
      if (cancelled) return
      const next: Record<string, EtaInfo> = {}
      journeys.forEach((j, i) => (next[j.id] = results[i]))
      setEtas(next)
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [journeys])

  const best = useMemo(() => {
    const first = (j: Journey) => {
      const m = etas[j.id]?.mins
      return m && m.length > 0 ? m[0] : 9999
    }
    return [...journeys].sort((a, b) => first(a) - first(b) || a.walkToBoard - b.walkToBoard).slice(0, 3)
  }, [journeys, etas])

  return (
    <div className="pcard p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onGo} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-bold">
            {fav.from.label.split(',')[0].replace('📍 ', '')} → {fav.to.label.split(',')[0]}
          </span>
        </button>
        <button onClick={onRemove} className="shrink-0 text-muted hover:text-hkred" aria-label="刪除收藏">
          ✕
        </button>
      </div>
      {journeys.length === 0 && <p className="mt-2 text-sm text-muted">揾唔到直達巴士 🥲</p>}
      <ul className="mt-2 space-y-2">
        {best.map(j => {
          const eta = etas[j.id]
          return (
            <li key={j.id} className="flex items-center gap-3">
              <RouteBadge co={j.co} route={j.route} size="text-xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                {j.board.nameTC.split(',')[0]} 上車
              </span>
              <span className="shrink-0">
                {!eta && <span className="text-sm text-muted">…</span>}
                {eta && eta.mins.length === 0 && (
                  <span className="text-xs text-muted">{eta.rmk || '暫無班次'}</span>
                )}
                {eta && eta.mins.length > 0 && <EtaBadge mins={eta.mins[0]} />}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type Mode = 'p2p' | 'route' | 'fav'

const NAV_TABS: { id: Mode; icon: string; label: string }[] = [
  { id: 'p2p', icon: '🚏', label: '點對點' },
  { id: 'route', icon: '🔍', label: '查路線' },
  { id: 'fav', icon: '★', label: '收藏' },
]

export default function App() {
  const [db, setDb] = useState<DB | null>(null)
  const [dbErr, setDbErr] = useState(false)
  const [mode, setMode] = useState<Mode>('p2p')
  const fromInput = usePlaceInput(db)
  const toInput = usePlaceInput(db)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [etas, setEtas] = useState<Record<string, EtaInfo>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [routeQ, setRouteQ] = useState('')
  const [routeSel, setRouteSel] = useState<RouteVariant | null>(null)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'day')
  const [favs, setFavs] = useState<Fav[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bus-favs') ?? '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    loadDB().then(setDb).catch(() => setDbErr(true))
  }, [])

  const toggleTheme = () => {
    const next = theme === 'day' ? 'night' : 'day'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
  }

  const from = fromInput.place
  const to = toInput.place

  const journeys = useMemo(
    () => (db && from && to ? findJourneys(db, from, to) : []),
    [db, from, to],
  )

  const routeResults = useMemo(
    () => (db && mode === 'route' && !routeSel ? searchRoutes(db, routeQ) : []),
    [db, mode, routeQ, routeSel],
  )

  useEffect(() => {
    if (mode !== 'p2p' || journeys.length === 0) {
      setEtas({})
      return
    }
    let cancelled = false
    const load = async () => {
      setRefreshing(true)
      const results = await Promise.all(journeys.map(j => fetchEta(j)))
      if (cancelled) return
      const next: Record<string, EtaInfo> = {}
      journeys.forEach((j, i) => (next[j.id] = results[i]))
      setEtas(next)
      setRefreshing(false)
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [journeys, mode])

  const sorted = useMemo(() => {
    const first = (j: Journey) => {
      const m = etas[j.id]?.mins
      return m && m.length > 0 ? m[0] : 9999
    }
    return [...journeys].sort((a, b) => first(a) - first(b) || a.walkToBoard - b.walkToBoard)
  }, [journeys, etas])

  const useGps = async () => {
    setGpsBusy(true)
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
      fromInput.setPlace({ label: '📍 現在位置', lat: pos.coords.latitude, lng: pos.coords.longitude })
      fromInput.setText('')
    } catch {
      alert('攞唔到位置，請檢查定位權限')
    }
    setGpsBusy(false)
  }

  const swap = () => {
    const f = fromInput.place
    fromInput.setPlace(toInput.place)
    toInput.setPlace(f)
  }

  const isFav = !!(from && to && favs.some(f => f.from.label === from.label && f.to.label === to.label))
  const saveFavs = (next: Fav[]) => {
    setFavs(next)
    localStorage.setItem('bus-favs', JSON.stringify(next))
  }
  const toggleFav = () => {
    if (!from || !to) return
    saveFavs(
      isFav
        ? favs.filter(f => !(f.from.label === from.label && f.to.label === to.label))
        : [...favs, { from, to }],
    )
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-28 text-ink">
      <header className="flex items-center justify-between px-4 pb-1 pt-5">
        <h1 className="font-pixel text-2xl text-hkred">搭咩巴士 🚌</h1>
        <div className="flex items-center gap-3">
          {refreshing && <span className="text-xs text-muted">更新中…</span>}
          <button onClick={toggleTheme} className="pbtn px-2 py-1 text-sm" title="日/夜">
            {theme === 'day' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {mode === 'p2p' && (
        <>
          <section className="space-y-3 p-4">
            <LocationField
              input={fromInput}
              placeholder="出發地 — 打站名或㩒📍"
              onGps={useGps}
              gpsBusy={gpsBusy}
            />
            <div className="flex items-center justify-between px-1">
              <button onClick={swap} className="pbtn px-2.5 py-1 text-sm text-muted" title="調轉">
                ⇅ 調轉
              </button>
              {from && to && (
                <button
                  onClick={toggleFav}
                  className={`pbtn px-2.5 py-1 text-sm ${isFav ? 'text-led' : 'text-muted'}`}
                >
                  {isFav ? '★ 已收藏' : '☆ 收藏路線'}
                </button>
              )}
            </div>
            <LocationField input={toInput} placeholder="目的地" />

            {favs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pt-1">
                {favs.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      fromInput.setPlace(f.from)
                      toInput.setPlace(f.to)
                    }}
                    className="pbtn shrink-0 px-3 py-1.5 text-xs text-muted"
                  >
                    {f.from.label.split(',')[0].replace('📍 ', '')} → {f.to.label.split(',')[0]}
                  </button>
                ))}
              </div>
            )}
          </section>

          <main className="px-4">
            {dbErr && <p className="py-10 text-center text-sm text-hkred">路線資料載入失敗，請重新整理</p>}
            {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
            {db && from && to && sorted.length === 0 && (
              <div className="py-10 text-center text-sm text-muted">
                <p className="text-3xl">🚏</p>
                <p className="mt-2">冇車喎 🥲 揾唔到直達巴士</p>
                <p>試下揀近啲嘅站？</p>
              </div>
            )}
            {db && (!from || !to) && (
              <p className="py-10 text-center text-sm text-muted">
                揀好出發地同目的地，即刻話你知搭咩車 ⚡️
              </p>
            )}

            <ul className="space-y-4">
              {sorted.map(j => {
                const eta = etas[j.id]
                return (
                  <li key={j.id} className="pcard p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <RouteBadge co={j.co} route={j.route} />
                          <span className="truncate text-sm text-hkblue">
                            {CO_NAME[j.co]} · 往{j.destTC}
                          </span>
                        </div>
                        <p className="mt-2.5 text-sm">
                          {j.board.nameTC.split(',')[0]}
                          <span className="text-muted"> 上車 · 行{j.walkToBoard}米</span>
                        </p>
                        <p className="text-sm text-muted">
                          搭{j.numStops}個站 → {j.alight.nameTC.split(',')[0]} 落車
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {!eta && <span className="text-sm text-muted">…</span>}
                        {eta && eta.mins.length === 0 && (
                          <span className="max-w-28 text-right text-xs text-muted">
                            {eta.rmk || '暫無班次'}
                          </span>
                        )}
                        {eta && eta.mins.length > 0 && (
                          <>
                            <EtaBadge mins={eta.mins[0]} />
                            {eta.mins.length > 1 && (
                              <span className="text-xs text-muted">
                                之後 {eta.mins.slice(1).join(', ')} 分
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </main>
        </>
      )}

      {mode === 'route' && (
        <main className="p-4">
          {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
          {db && !routeSel && (
            <>
              <div className="pcard flex items-center gap-2 px-3">
                <input
                  value={routeQ}
                  placeholder="打巴士號碼 — 6 / 118 / N21…"
                  inputMode="text"
                  autoCapitalize="characters"
                  className="min-w-0 flex-1 bg-transparent py-3 text-[15px] uppercase outline-none placeholder:text-muted"
                  onChange={e => setRouteQ(e.target.value)}
                />
                {routeQ && (
                  <button className="text-muted hover:text-ink" onClick={() => setRouteQ('')} aria-label="清除">
                    ✕
                  </button>
                )}
              </div>
              {routeQ && routeResults.length === 0 && (
                <p className="py-10 text-center text-sm text-muted">冇呢條線喎 🤔</p>
              )}
              {!routeQ && (
                <p className="py-10 text-center text-sm text-muted">打路線號碼，睇成條線嘅站同到站時間</p>
              )}
              <ul className="mt-4 space-y-3">
                {routeResults.map(v => (
                  <li key={`${v.co}:${v.key}`}>
                    <button
                      className="pcard flex w-full items-center gap-3 px-3 py-3 text-left"
                      onClick={() => setRouteSel(v)}
                    >
                      <RouteBadge co={v.co} route={v.route} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {v.origTC} → <span className="font-medium">{v.destTC}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{CO_NAME[v.co]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {db && routeSel && <RouteDetail db={db} v={routeSel} onBack={() => setRouteSel(null)} />}
        </main>
      )}

      {mode === 'fav' && (
        <main className="space-y-4 p-4">
          {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
          {db && favs.length === 0 && (
            <div className="py-10 text-center text-sm text-muted">
              <p className="text-3xl">☆</p>
              <p className="mt-2">未有收藏路線</p>
              <p>去「點對點」揀好路線，㩒「☆ 收藏路線」</p>
            </div>
          )}
          {db &&
            favs.map((f, i) => (
              <FavRow
                key={`${f.from.label}-${f.to.label}`}
                db={db}
                fav={f}
                onGo={() => {
                  fromInput.setPlace(f.from)
                  toInput.setPlace(f.to)
                  setMode('p2p')
                }}
                onRemove={() => saveFavs(favs.filter((_, j) => j !== i))}
              />
            ))}
        </main>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t-2 border-line bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {NAV_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 ${
                mode === t.id ? 'font-bold text-accent' : 'text-muted'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-xs">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
