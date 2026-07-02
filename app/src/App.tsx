import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import {
  loadDB,
  searchStops,
  searchRoutesGrouped,
  searchStopGroups,
  routeNumbersAtStops,
  specialRoutes,
  variantPasses,
  getFare,
  normName,
  type DB,
  type Co,
  type Place,
  type RouteGroup,
  type StopGroup,
  type SpecialKind,
} from './lib/data.ts'
import {
  findJourneys,
  groupJourneys,
  fetchGroupEta,
  fetchStopEta,
  routesAtStopGroup,
  fetchStopRowEta,
  type JourneyGroup,
  type EtaInfo,
  type StopRouteRow,
} from './lib/journey.ts'
import {
  BusIcon,
  GpsIcon,
  SwapIcon,
  StarIcon,
  XIcon,
  SearchIcon,
  BackIcon,
  JourneyIcon,
  SunIcon,
  MoonIcon,
  StopIcon,
  LinkIcon,
  PlaneIcon,
} from './icons.tsx'

const CO_NAME: Record<string, string> = { kmb: '九巴', ctb: '城巴' }

interface Fav {
  from: Place
  to: Place
}

interface RouteFav {
  gkey: string
  route: string
  origTC: string
  destTC: string
  cos: Co[]
}

function RouteBadge({ cos, route, size = 'text-sm' }: { cos: Co[]; route: string; size?: string }) {
  const main = cos[0]
  return (
    <span
      className={`font-num inline-flex min-w-12 shrink-0 items-center justify-center rounded-lg px-2 py-1 ${size}`}
      style={{ background: `var(--co-${main})`, color: `var(--co-${main}-fg)` }}
    >
      {route}
    </span>
  )
}

function CoStripe({ cos }: { cos: Co[] }) {
  return (
    <span className="co-stripe" aria-hidden="true">
      {cos.map(c => (
        <span key={c} style={{ background: `var(--co-${c})` }} />
      ))}
    </span>
  )
}

function CoLabel({ cos }: { cos: Co[] }) {
  return <>{cos.map(c => CO_NAME[c]).join(' + ')}</>
}

/* 30 秒自動更新倒數環：tick 轉一次 = 重新開始 */
function EtaRing({ tick }: { tick: number }) {
  return (
    <svg key={tick} width="14" height="14" viewBox="0 0 20 20" className="-rotate-90" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeDasharray="50.27"
        strokeLinecap="round"
        className="ring-arc"
      />
    </svg>
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
      <div className="card flex items-center gap-1 px-3 transition-colors focus-within:border-accent">
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
            className="icon-btn"
            onClick={() => {
              input.setPlace(null)
              input.setText('')
              ref.current?.focus()
            }}
            aria-label="清除"
          >
            <XIcon size={16} />
          </button>
        )}
        {onGps && (
          <button
            onClick={onGps}
            disabled={gpsBusy}
            className={`icon-btn text-accent ${gpsBusy ? 'animate-pulse' : ''}`}
            title="用現在位置"
            aria-label="用現在位置"
          >
            <GpsIcon size={18} />
          </button>
        )}
      </div>
      {input.suggestions.length > 0 && (
        <ul className="pop absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-auto py-1">
          {input.suggestions.map((p, i) => (
            <li key={i}>
              <button
                className="w-full px-4 py-2.5 text-left text-[15px] hover:bg-accent-soft"
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
    return <span className="eta-pulse font-num text-lg text-led">即到</span>
  }
  return (
    <span className="flex items-baseline gap-1">
      <span className={`font-num text-3xl leading-none ${mins <= 3 ? 'text-led' : 'text-ink'}`}>
        {mins}
      </span>
      <span className="text-xs text-muted">分</span>
    </span>
  )
}

function BusLoading({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto max-w-60 overflow-hidden border-b border-line">
        <div className="bus-drive w-fit py-1 text-muted">
          <BusIcon size={28} />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{label}</p>
    </div>
  )
}

function EmptyState({ icon, lines }: { icon: ReactNode; lines: string[] }) {
  return (
    <div className="py-12 text-center text-sm text-muted">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        {icon}
      </div>
      {lines.map((l, i) => (
        <p key={i} className={i === 0 ? 'font-medium text-ink' : 'mt-1'}>
          {l}
        </p>
      ))}
    </div>
  )
}

/* 點對點行程卡：色帶 + 行程軸線 + 車費 + 倒數環 */
function JourneyCard(props: { db: DB; g: JourneyGroup; eta?: EtaInfo; tick: number }) {
  const { db, g, eta, tick } = props
  const fare = getFare(db, g.cos, g.route)
  return (
    <li className="card flex gap-3 p-4">
      <CoStripe cos={g.cos} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <RouteBadge cos={g.cos} route={g.route} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">往{g.destTC}</p>
            <p className="text-[11px] text-muted">
              <CoLabel cos={g.cos} />
              {fare && <> · ${fare.fare}</>}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2.5">
          <div className="flex flex-col items-center pt-1.5">
            <span className="axis-dot" />
            <span className="axis-line" />
            <span className="axis-dot end" />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate">
              {g.board.nameTC.split(',')[0]}
              <span className="text-muted"> 上車 · 行{g.walkToBoard}米</span>
            </p>
            <p className="py-0.5 text-[11px] text-muted">搭{g.numStops}個站</p>
            <p className="truncate">
              {g.alight.nameTC.split(',')[0]}
              <span className="text-muted"> 落車</span>
            </p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {!eta && <span className="text-sm text-muted">…</span>}
        {eta && eta.mins.length === 0 && (
          <span className="max-w-24 text-right text-xs text-muted">{eta.rmk || '暫無班次'}</span>
        )}
        {eta && eta.mins.length > 0 && (
          <>
            <span className="flex items-center gap-1.5">
              <EtaRing tick={tick} />
              <EtaBadge mins={eta.mins[0]} />
            </span>
            {eta.mins.length > 1 && (
              <span className="text-xs text-muted">之後 {eta.mins.slice(1).join(', ')} 分</span>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function RouteDetail(props: {
  db: DB
  g: RouteGroup
  onBack: () => void
  isFav: boolean
  onToggleFav: () => void
}) {
  const { db, g, onBack, isFav, onToggleFav } = props
  const [coIdx, setCoIdx] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [eta, setEta] = useState<EtaInfo | null>(null)
  const reqRef = useRef(0)
  const v = g.variants[coIdx]
  const fare = getFare(db, g.cos, g.route)

  const switchCo = (i: number) => {
    setCoIdx(i)
    setExpanded(null)
    setEta(null)
  }

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
    <div className="slide-in">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={onBack} className="icon-btn -ml-2" aria-label="返去">
          <BackIcon size={20} />
        </button>
        <RouteBadge cos={[v.co]} route={v.route} />
        <span className="min-w-0 flex-1 truncate text-sm">往{v.destTC}</span>
        <button
          onClick={onToggleFav}
          className={`icon-btn ${isFav ? 'text-accent' : ''}`}
          aria-label={isFav ? '取消收藏路線' : '收藏路線'}
        >
          <StarIcon size={18} filled={isFav} />
        </button>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2 pl-1">
        <span className="text-xs text-muted">
          {fare && <>全程 ${fare.fare} · </>}
          {fare?.url ? (
            <a href={fare.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
              官方時間表 <LinkIcon size={12} />
            </a>
          ) : (
            <CoLabel cos={g.cos} />
          )}
        </span>
        {g.variants.length > 1 ? (
          <div className="seg shrink-0">
            {g.variants.map((vv, i) => (
              <button key={vv.co} className={i === coIdx ? 'on' : ''} onClick={() => switchCo(i)}>
                {CO_NAME[vv.co]}
              </button>
            ))}
          </div>
        ) : (
          <span className="shrink-0 text-xs text-muted">{CO_NAME[v.co]}</span>
        )}
      </div>
      <ol className="card overflow-hidden">
        {v.stops.map((stopId, idx) => {
          const s = db.stopMap.get(`${v.co}:${stopId}`)
          if (!s) return null
          const open = expanded === idx
          return (
            <li key={idx} className="border-b border-line last:border-b-0">
              <button
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${open ? 'bg-accent-soft' : ''}`}
                onClick={() => toggle(idx, stopId)}
              >
                <span className="font-num w-6 shrink-0 text-right text-xs text-muted">
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

/* 車站詳情：成個站所有路線 + 實時 ETA */
function StopDetail(props: {
  db: DB
  g: StopGroup
  onBack: () => void
  onOpenRoute: (row: StopRouteRow) => void
}) {
  const { db, g, onBack, onOpenRoute } = props
  const rows = useMemo(() => routesAtStopGroup(db, g.stops), [db, g])
  const [etas, setEtas] = useState<Record<string, EtaInfo>>({})

  useEffect(() => {
    if (rows.length === 0) return
    let cancelled = false
    const load = async () => {
      const results = await Promise.all(rows.map(r => fetchStopRowEta(r)))
      if (cancelled) return
      const next: Record<string, EtaInfo> = {}
      rows.forEach((r, i) => (next[r.id] = results[i]))
      setEtas(next)
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [rows])

  return (
    <div className="slide-in">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="icon-btn -ml-2" aria-label="返去">
          <BackIcon size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{g.name}</p>
          <p className="text-xs text-muted">{rows.length} 條路線</p>
        </div>
      </div>
      <ol className="card overflow-hidden">
        {rows.map(row => {
          const eta = etas[row.id]
          return (
            <li key={row.id} className="border-b border-line last:border-b-0">
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                onClick={() => onOpenRoute(row)}
              >
                <RouteBadge cos={row.cos} route={row.route} size="text-xs" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  往{row.destTC}
                  <span className="text-muted"> · <CoLabel cos={row.cos} /></span>
                </span>
                <span className="shrink-0">
                  {!eta && <span className="text-sm text-muted">…</span>}
                  {eta && eta.mins.length === 0 && (
                    <span className="text-xs text-muted">{eta.rmk || '暫無班次'}</span>
                  )}
                  {eta && eta.mins.length > 0 && (
                    <span className="flex items-baseline gap-1.5">
                      <EtaBadge mins={eta.mins[0]} />
                      {eta.mins.length > 1 && (
                        <span className="text-xs text-muted">{eta.mins.slice(1).join(', ')} 分</span>
                      )}
                    </span>
                  )}
                </span>
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

  const groups = useMemo(() => groupJourneys(findJourneys(db, fav.from, fav.to)), [db, fav])

  useEffect(() => {
    if (groups.length === 0) return
    let cancelled = false
    const load = async () => {
      const results = await Promise.all(groups.map(g => fetchGroupEta(g)))
      if (cancelled) return
      const next: Record<string, EtaInfo> = {}
      groups.forEach((g, i) => (next[g.id] = results[i]))
      setEtas(next)
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [groups])

  const best = useMemo(() => {
    const first = (g: JourneyGroup) => {
      const m = etas[g.id]?.mins
      return m && m.length > 0 ? m[0] : 9999
    }
    return [...groups].sort((a, b) => first(a) - first(b) || a.walkToBoard - b.walkToBoard).slice(0, 3)
  }, [groups, etas])

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onGo} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-bold">
            {fav.from.label.split(',')[0].replace('📍 ', '')} → {fav.to.label.split(',')[0]}
          </span>
        </button>
        <button onClick={onRemove} className="icon-btn -mr-2 shrink-0" aria-label="刪除收藏">
          <XIcon size={16} />
        </button>
      </div>
      {groups.length === 0 && <p className="mt-2 text-sm text-muted">揾唔到直達巴士</p>}
      <ul className="mt-2 space-y-2">
        {best.map(g => {
          const eta = etas[g.id]
          return (
            <li key={g.id} className="flex items-center gap-3">
              <RouteBadge cos={g.cos} route={g.route} size="text-xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                {g.board.nameTC.split(',')[0]} 上車
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

type Mode = 'p2p' | 'route' | 'special' | 'fav'

const NAV_TABS: { id: Mode; icon: (size: number) => ReactNode; label: string }[] = [
  { id: 'p2p', icon: s => <JourneyIcon size={s} />, label: '點對點' },
  { id: 'route', icon: s => <SearchIcon size={s} />, label: '搜尋' },
  { id: 'special', icon: s => <PlaneIcon size={s} />, label: '專線' },
  { id: 'fav', icon: s => <StarIcon size={s} />, label: '收藏' },
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
  const [tick, setTick] = useState(0)
  const [routeQ, setRouteQ] = useState('')
  const [routeSel, setRouteSel] = useState<RouteGroup | null>(null)
  const [stopSel, setStopSel] = useState<StopGroup | null>(null)
  const [spCat, setSpCat] = useState<SpecialKind>('night')
  const [spFrom, setSpFrom] = useState('')
  const [spTo, setSpTo] = useState('')
  const [spSel, setSpSel] = useState<RouteGroup | null>(null)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'day')
  const [favs, setFavs] = useState<Fav[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bus-favs') ?? '[]')
    } catch {
      return []
    }
  })
  const [routeFavs, setRouteFavs] = useState<RouteFav[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bus-route-favs') ?? '[]')
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

  const groups = useMemo(
    () => (db && from && to ? groupJourneys(findJourneys(db, from, to)) : []),
    [db, from, to],
  )

  const routeResults = useMemo(
    () => (db && mode === 'route' && !routeSel && !stopSel ? searchRoutesGrouped(db, routeQ) : []),
    [db, mode, routeQ, routeSel, stopSel],
  )

  const stopGroups = useMemo(
    () => (db && mode === 'route' && !routeSel && !stopSel ? searchStopGroups(db, routeQ) : []),
    [db, mode, routeQ, routeSel, stopSel],
  )

  const specialList = useMemo(() => {
    if (!db || mode !== 'special' || spSel) return []
    return specialRoutes(db, spCat).filter(g =>
      g.variants.some(v => variantPasses(db, v, spFrom, spTo)),
    )
  }, [db, mode, spCat, spFrom, spTo, spSel])

  /* 由車站詳情row揾返對應嘅 RouteGroup 開詳情 */
  const openRowAsGroup = (row: StopRouteRow) => {
    if (!db) return
    const gs = searchRoutesGrouped(db, row.route, 50).filter(x => x.route === row.route)
    const g = gs.find(x => normName(x.destTC) === normName(row.destTC)) ?? gs[0]
    if (g) setRouteSel(g)
  }

  useEffect(() => {
    if (mode !== 'p2p' || groups.length === 0) {
      setEtas({})
      return
    }
    let cancelled = false
    const load = async () => {
      setRefreshing(true)
      const results = await Promise.all(groups.map(g => fetchGroupEta(g)))
      if (cancelled) return
      const next: Record<string, EtaInfo> = {}
      groups.forEach((g, i) => (next[g.id] = results[i]))
      setEtas(next)
      setRefreshing(false)
      setTick(t => t + 1)
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [groups, mode])

  const sorted = useMemo(() => {
    const first = (g: JourneyGroup) => {
      const m = etas[g.id]?.mins
      return m && m.length > 0 ? m[0] : 9999
    }
    return [...groups].sort((a, b) => first(a) - first(b) || a.walkToBoard - b.walkToBoard)
  }, [groups, etas])

  const useGps = async () => {
    setGpsBusy(true)
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
      fromInput.setPlace({ label: '現在位置', lat: pos.coords.latitude, lng: pos.coords.longitude })
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

  const saveRouteFavs = (next: RouteFav[]) => {
    setRouteFavs(next)
    localStorage.setItem('bus-route-favs', JSON.stringify(next))
  }
  const isRouteFav = (g: RouteGroup) => routeFavs.some(f => f.gkey === g.gkey)
  const toggleRouteFav = (g: RouteGroup) => {
    saveRouteFavs(
      isRouteFav(g)
        ? routeFavs.filter(f => f.gkey !== g.gkey)
        : [...routeFavs, { gkey: g.gkey, route: g.route, origTC: g.origTC, destTC: g.destTC, cos: g.cos }],
    )
  }
  const openRouteFav = (f: RouteFav) => {
    if (!db) return
    const g =
      searchRoutesGrouped(db, f.route, 50).find(x => x.gkey === f.gkey) ??
      searchRoutesGrouped(db, f.route, 1)[0]
    if (!g) return
    setRouteQ(f.route)
    setRouteSel(g)
    setMode('route')
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-32 text-ink">
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white">
            <BusIcon size={18} />
          </span>
          搭咩巴士
        </h1>
        <div className="flex items-center gap-2">
          {refreshing && <span className="text-xs text-muted">更新中…</span>}
          <button onClick={toggleTheme} className="btn h-9 w-9 justify-center p-0" title="日/夜" aria-label="日/夜">
            {theme === 'day' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
          </button>
        </div>
      </header>

      {mode === 'p2p' && (
        <div key="p2p" className="view-in">
          <section className="space-y-3 p-4">
            <LocationField
              input={fromInput}
              placeholder="出發地 — 打站名或用定位"
              onGps={useGps}
              gpsBusy={gpsBusy}
            />
            <div className="flex h-8 items-center justify-between px-1">
              <button onClick={swap} className="btn px-3 py-1 text-sm text-muted" title="調轉">
                <SwapIcon size={14} /> 調轉
              </button>
              {from && to && (
                <button onClick={toggleFav} className={`btn px-3 py-1 text-sm ${isFav ? 'btn-on' : 'text-muted'}`}>
                  <StarIcon size={14} filled={isFav} /> {isFav ? '已收藏' : '收藏路線'}
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
                    className="btn shrink-0 px-3 py-1.5 text-xs text-muted"
                  >
                    {f.from.label.split(',')[0].replace('📍 ', '')} → {f.to.label.split(',')[0]}
                  </button>
                ))}
              </div>
            )}
          </section>

          <main className="px-4">
            {dbErr && <p className="py-10 text-center text-sm text-accent">路線資料載入失敗，請重新整理</p>}
            {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
            {db && from && to && sorted.length === 0 && (
              <EmptyState
                icon={<StopIcon size={26} />}
                lines={['揾唔到直達巴士', '試下揀近啲嘅站？']}
              />
            )}
            {db && (!from || !to) && (
              <p className="py-10 text-center text-sm text-muted">
                揀好出發地同目的地，即刻話你知搭咩車
              </p>
            )}

            <ul className="stagger space-y-3">
              {db &&
                sorted.map(g => (
                  <JourneyCard key={g.id} db={db} g={g} eta={etas[g.id]} tick={tick} />
                ))}
            </ul>
          </main>
        </div>
      )}

      {mode === 'route' && (
        <main key="route" className="view-in p-4">
          {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
          {db && !routeSel && !stopSel && (
            <>
              <div className="card flex items-center gap-2 px-3 transition-colors focus-within:border-accent">
                <span className="text-muted">
                  <SearchIcon size={16} />
                </span>
                <input
                  value={routeQ}
                  placeholder="路線號 或 地點名 — 118 / 旺角…"
                  inputMode="text"
                  autoCapitalize="characters"
                  className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none placeholder:text-muted"
                  onChange={e => setRouteQ(e.target.value)}
                />
                {routeQ && (
                  <button className="icon-btn" onClick={() => setRouteQ('')} aria-label="清除">
                    <XIcon size={16} />
                  </button>
                )}
              </div>
              {routeQ && routeResults.length === 0 && stopGroups.length === 0 && (
                <EmptyState icon={<SearchIcon size={24} />} lines={['乜都揾唔到喎', '試下路線號或者站名？']} />
              )}
              {!routeQ && (
                <p className="py-10 text-center text-sm text-muted">
                  打路線號睇成條線，或者打地點名睇附近車站
                </p>
              )}

              {routeResults.length > 0 && (
                <section className="mt-4">
                  {stopGroups.length > 0 && (
                    <h2 className="mb-2 px-1 text-xs font-semibold text-muted">路線</h2>
                  )}
                  <ul className="stagger space-y-2.5">
                    {routeResults.map(g => {
                      const fare = getFare(db, g.cos, g.route)
                      return (
                        <li key={g.gkey}>
                          <button
                            className="card flex w-full items-center gap-3 py-3 pl-3 pr-4 text-left"
                            onClick={() => setRouteSel(g)}
                          >
                            <CoStripe cos={g.cos} />
                            <RouteBadge cos={g.cos} route={g.route} />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {g.origTC} → <span className="font-medium">{g.destTC}</span>
                            </span>
                            <span className="shrink-0 text-right text-xs text-muted">
                              <CoLabel cos={g.cos} />
                              {fare && (
                                <>
                                  <br />${fare.fare}
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {stopGroups.length > 0 && (
                <section className="mt-4">
                  <h2 className="mb-2 px-1 text-xs font-semibold text-muted">車站</h2>
                  <ul className="stagger space-y-2.5">
                    {stopGroups.map(g => {
                      const nums = routeNumbersAtStops(db, g.stops)
                      return (
                        <li key={`${g.name}-${g.stops[0].id}`}>
                          <button
                            className="card flex w-full items-center gap-3 px-4 py-3 text-left"
                            onClick={() => setStopSel(g)}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                              <StopIcon size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{g.name}</span>
                              <span className="block truncate text-xs text-muted">
                                {nums.slice(0, 5).join(' · ')}
                                {nums.length > 5 && ` · 共${nums.length}條線`}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </>
          )}
          {db && stopSel && !routeSel && (
            <StopDetail db={db} g={stopSel} onBack={() => setStopSel(null)} onOpenRoute={openRowAsGroup} />
          )}
          {db && routeSel && (
            <RouteDetail
              db={db}
              g={routeSel}
              onBack={() => setRouteSel(null)}
              isFav={isRouteFav(routeSel)}
              onToggleFav={() => toggleRouteFav(routeSel)}
            />
          )}
        </main>
      )}

      {mode === 'special' && (
        <main key="special" className="view-in p-4">
          {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
          {db && spSel && (
            <RouteDetail
              db={db}
              g={spSel}
              onBack={() => setSpSel(null)}
              isFav={isRouteFav(spSel)}
              onToggleFav={() => toggleRouteFav(spSel)}
            />
          )}
          {db && !spSel && (
            <>
              <div className="seg flex w-full">
                {(
                  [
                    ['night', '通宵車 N'],
                    ['airport', '機場巴士'],
                  ] as [SpecialKind, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className={`flex-1 ${spCat === k ? 'on' : ''}`}
                    onClick={() => setSpCat(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <div className="card flex min-w-0 flex-1 items-center gap-1 px-3 transition-colors focus-within:border-accent">
                  <input
                    value={spFrom}
                    placeholder="由 — 地點/站名"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
                    onChange={e => setSpFrom(e.target.value)}
                  />
                  {spFrom && (
                    <button className="icon-btn -mr-1 h-7 w-7" onClick={() => setSpFrom('')} aria-label="清除">
                      <XIcon size={13} />
                    </button>
                  )}
                </div>
                <div className="card flex min-w-0 flex-1 items-center gap-1 px-3 transition-colors focus-within:border-accent">
                  <input
                    value={spTo}
                    placeholder="去 — 地點/站名"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
                    onChange={e => setSpTo(e.target.value)}
                  />
                  {spTo && (
                    <button className="icon-btn -mr-1 h-7 w-7" onClick={() => setSpTo('')} aria-label="清除">
                      <XIcon size={13} />
                    </button>
                  )}
                </div>
              </div>
              {specialList.length === 0 && (
                <EmptyState
                  icon={spCat === 'night' ? <MoonIcon size={24} /> : <PlaneIcon size={22} />}
                  lines={['冇符合嘅路線', '試下改吓「由/去」？']}
                />
              )}
              <ul className="stagger mt-4 space-y-2.5">
                {specialList.map(g => {
                  const fare = getFare(db, g.cos, g.route)
                  return (
                    <li key={g.gkey}>
                      <button
                        className="card flex w-full items-center gap-3 py-3 pl-3 pr-4 text-left"
                        onClick={() => setSpSel(g)}
                      >
                        <CoStripe cos={g.cos} />
                        <RouteBadge cos={g.cos} route={g.route} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {g.origTC} → <span className="font-medium">{g.destTC}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted">
                          <CoLabel cos={g.cos} />
                          {fare && (
                            <>
                              <br />${fare.fare}
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </main>
      )}

      {mode === 'fav' && (
        <main key="fav" className="view-in space-y-4 p-4">
          {!db && !dbErr && <BusLoading label="載入路線資料中…" />}
          {db && favs.length === 0 && routeFavs.length === 0 && (
            <EmptyState
              icon={<StarIcon size={24} />}
              lines={['未有收藏', '喺點對點㩒「收藏路線」，或者喺路線詳情㩒星星']}
            />
          )}

          {db && routeFavs.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold text-muted">路線</h2>
              <ul className="space-y-2.5">
                {routeFavs.map(f => {
                  const fare = getFare(db, f.cos, f.route)
                  return (
                    <li key={f.gkey}>
                      <div className="card flex w-full items-center gap-3 py-3 pl-3 pr-2">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => openRouteFav(f)}
                        >
                          <CoStripe cos={f.cos} />
                          <RouteBadge cos={f.cos} route={f.route} />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {f.origTC} → <span className="font-medium">{f.destTC}</span>
                          </span>
                          {fare && <span className="shrink-0 text-xs text-muted">${fare.fare}</span>}
                        </button>
                        <button
                          className="icon-btn shrink-0"
                          onClick={() => saveRouteFavs(routeFavs.filter(x => x.gkey !== f.gkey))}
                          aria-label="刪除收藏"
                        >
                          <XIcon size={16} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {db && favs.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold text-muted">點對點</h2>
              <div className="space-y-3">
                {favs.map((f, i) => (
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
              </div>
            </section>
          )}
        </main>
      )}

      <nav className="navbar" aria-label="主導航">
        {NAV_TABS.map(t => (
          <button key={t.id} onClick={() => setMode(t.id)} className={mode === t.id ? 'on' : ''}>
            {t.icon(18)}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
