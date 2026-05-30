'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* ─────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────── */
interface OddsTriple {
  home: number
  draw: number
  away: number
}

interface Probs {
  Home: number
  Draw: number
  Away: number
}

interface Stakes {
  Home: number
  Draw: number
  Away: number
}

interface ValueBets {
  Home: boolean
  Draw: boolean
  Away: boolean
}

interface MatchRow {
  date: string
  time: string
  home_team: string
  away_team: string
  home_match_no: number
  away_match_no: number
  b365_odds: OddsTriple
  probabilities: {
    Maher: Probs
    Dixon: Probs
    XGBoost: Probs
  }
  b365_kelly: { Maher: Stakes; Dixon: Stakes; XGBoost: Stakes }
  b365_values: { Maher: ValueBets; Dixon: ValueBets; XGBoost: ValueBets }
}

interface PredictionResponse {
  match: string
  date: string
  probabilities: {
    Maher: Probs
    Dixon: Probs
    XGBoost: Probs
  }
  kelly_stakes: {
    Maher: Stakes
    Dixon: Stakes
    XGBoost: Stakes
    Kelly_Fraction_Used: {
      Maher: number
      Dixon: number
      XGBoost: number
    }
  }
  value_bets: {
    Maher: ValueBets
    Dixon: ValueBets
    XGBoost: ValueBets
  }
}

type ModelKey = 'Maher' | 'Dixon' | 'XGBoost'

const MODEL_LABELS: Record<ModelKey, string> = {
  Maher: 'Maher',
  Dixon: 'Dixon-Coles',
  XGBoost: 'XGBoost',
}

const OUTCOME_LABELS = {
  Home: 'VICTORIA LOCAL',
  Draw: 'EMPATE',
  Away: 'VICTORIA VISITANTE',
} as const

const NO_BET_LABELS = {
  Home: 'VICTORIA LOCAL',
  Draw: 'EMPATE',
  Away: 'VICTORIA VISITANTE',
} as const

/* ─────────────────────────────────────────────────────────────────
   Helpers & Components
───────────────────────────────────────────────────────────────── */
const toOdds = (p: number) => (p > 0.001 ? (1 / p).toFixed(2) : '∞')
const toPct = (p: number) => `${(p * 100).toFixed(1)}%`
const toKellyPct = (stake: number) => `${(stake * 100).toFixed(2)}%`
const formatEuros = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

const STAKE_EPSILON = 1e-6

function getModelStakes(
  kellyStakes: PredictionResponse['kelly_stakes'] | undefined,
  model: ModelKey
): Stakes | undefined {
  const entry = kellyStakes?.[model]
  if (!entry || typeof entry !== 'object') return undefined
  if (!('Home' in entry && 'Draw' in entry && 'Away' in entry)) return undefined
  return entry as Stakes
}

function parseOutcomeStake(stakes: Stakes | undefined, key: keyof Stakes): number {
  const v = stakes?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
}

function parseOutcomeValue(values: ValueBets | undefined, key: keyof ValueBets): boolean {
  const v = values?.[key]
  return v === true
}

interface KellyTooltipProps {
  stake: number
  isValue: boolean
  bankroll?: number
  children: ReactNode
}

function KellyTooltip({ stake, isValue, bankroll, children }: KellyTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const hasBankroll = bankroll !== undefined && bankroll > 0
  const stakePct = toKellyPct(stake)

  const showTooltip = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
  }

  if (!isValue) {
    return <>{children}</>
  }

  const tooltipLabel = hasBankroll
    ? `Kelly: ${formatEuros(stake * bankroll!)} (${stakePct})`
    : `Kelly: ${stakePct}`

  return (
    <>
      <span
        ref={anchorRef}
        className="cursor-help"
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltipPos(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltipPos(null)}
        tabIndex={0}
      >
        {children}
      </span>
      {tooltipPos &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full bg-zinc-900 text-amber-400 text-[10px] px-2 py-1 rounded-md shadow-xl border border-amber-900/50 whitespace-nowrap font-medium"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 6 }}
          >
            {tooltipLabel}
          </span>,
          document.body
        )}
    </>
  )
}

interface OddsCellProps {
  odds: OddsTriple
  stakes: Stakes
  values: ValueBets
  bankroll?: number
}

function OddsCell({ odds, stakes, values, bankroll }: OddsCellProps) {
  // Verificar si toda la casa de apuestas no tiene datos (todas las cuotas son 0)
  const hasNoData = odds.home === 0 && odds.draw === 0 && odds.away === 0

  const renderOdd = (odd: number, stake: number, isValue: boolean) => {
    // Si la cuota es 0, mostrar N/A en lugar de 0.00
    if (odd === 0) {
      return <span className="text-zinc-600 font-light">-</span>
    }

    const oddContent = (
      <span
        className={
          isValue
            ? 'text-amber-400 font-bold drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]'
            : 'text-zinc-200'
        }
      >
        {odd.toFixed(2)}
      </span>
    )

    return (
      <KellyTooltip stake={stake} isValue={isValue} bankroll={bankroll}>
        {oddContent}
      </KellyTooltip>
    )
  };

  // Si no hay datos de esta casa, mostrar mensaje unificado
  if (hasNoData) {
    return (
      <td className="px-6 py-4 text-center whitespace-nowrap text-xs">
        <span className="text-zinc-600 italic">N/A</span>
      </td>
    )
  }

  return (
    <td className="px-6 py-4 text-center tabular-nums whitespace-nowrap text-xs">
      {renderOdd(odds.home, stakes.Home, values.Home)}
      <span className="text-zinc-700 mx-1.5">|</span>
      {renderOdd(odds.draw, stakes.Draw, values.Draw)}
      <span className="text-zinc-700 mx-1.5">|</span>
      {renderOdd(odds.away, stakes.Away, values.Away)}
    </td>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/50">
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-40 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-6 bg-zinc-800/50 rounded animate-pulse w-32 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-20 mx-auto"></div></td>
    </tr>
  )
}

function TeamBadge({ teamName }: { teamName: string }) {
  const [imgError, setImgError] = useState(false)
  const initials = teamName.substring(0, 3).toUpperCase()
  
  return (
    <div className="relative w-9 h-9 flex items-center justify-center shrink-0 group cursor-pointer">
      {!imgError ? (
        <img 
          src={`/logos/${teamName}.png`} 
          alt={teamName}
          className="w-full h-full object-contain transition-transform duration-300 ease-out group-hover:scale-125 active:scale-95 drop-shadow-[0_0_2px_rgba(255,255,255,0.4)]"
          onError={() => setImgError(true)} 
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center text-[10px] font-bold text-zinc-300 transition-transform duration-300 ease-out group-hover:scale-110 active:scale-95">
          {initials}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Page Component
───────────────────────────────────────────────────────────────── */
export default function HomePage() {
  /* Mount state for hydration safety */
  const [isMounted, setIsMounted] = useState(false)

  /* Initial Data State */
  const [latestMatches, setLatestMatches] = useState<MatchRow[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [isLoadingInitial, setIsLoadingInitial] = useState(true)
  const [initialError, setInitialError] = useState<string | null>(null)

  /* Per-row model selector state */
  const [rowModels, setRowModels] = useState<Record<string, ModelKey>>({})
  const [bulkModelActive, setBulkModelActive] = useState<ModelKey>('Maher')

  /* Global bankroll (applies to table tooltips + simulator) */
  const [bankroll, setBankroll] = useState<string>('')

  /* Simulator State */
  const [simHomeTeam, setSimHomeTeam] = useState<string>('')
  const [simAwayTeam, setSimAwayTeam] = useState<string>('')
  const [simModel, setSimModel] = useState<ModelKey>('Maher')
  const [simOddsHome, setSimOddsHome] = useState<string>('2.5')
  const [simOddsDraw, setSimOddsDraw] = useState<string>('3.2')
  const [simOddsAway, setSimOddsAway] = useState<string>('2.8')
  const [simResult, setSimResult] = useState<PredictionResponse | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  /* ── Hydration Safety ────────────────────────────────────── */
  useEffect(() => {
    setIsMounted(true)
  }, [])

  /* ── Fetch Initial Data ────────────────────────────────────── */
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const [matchesRes, teamsRes] = await Promise.all([
          fetch('http://localhost:8000/api/latest-matchday'),
          fetch('http://localhost:8000/api/teams')
        ])

        if (!matchesRes.ok) throw new Error('Error al cargar los partidos de la jornada')
        if (!teamsRes.ok) throw new Error('Error al cargar los equipos')

        const matchesData: MatchRow[] = await matchesRes.json()
        
        const currentActiveTeams = Array.from(
          new Set(matchesData.flatMap(m => [m.home_team, m.away_team]))
        ).sort()
  
        setLatestMatches(matchesData)
        setTeams(currentActiveTeams)
          
        const initialRowModels: Record<string, ModelKey> = {}
        matchesData.forEach(m => {
          const key = `${m.home_team}-${m.away_team}-${m.date}`
          initialRowModels[key] = 'Maher'
        })
        setRowModels(initialRowModels)
  
        if (currentActiveTeams.length >= 2) {
          setSimHomeTeam(currentActiveTeams[0])
          setSimAwayTeam(currentActiveTeams[1])
        }
      } catch (err) {
        setInitialError(err instanceof Error ? err.message : 'Error de conexión')
      } finally {
        setIsLoadingInitial(false)
      }
    }

    fetchInitialData()
  }, [])

  /* ── Simulator Logic ───────────────────────────────────────── */
  const handleSimulate = async (overrideParams?: {
    home: string; away: string; oddsH: string; oddsD: string; oddsA: string; model: ModelKey
  }) => {
    const pHome = overrideParams?.home || simHomeTeam
    const pAway = overrideParams?.away || simAwayTeam
    const pOddsH = overrideParams?.oddsH || simOddsHome
    const pOddsD = overrideParams?.oddsD || simOddsDraw
    const pOddsA = overrideParams?.oddsA || simOddsAway

    if (!pHome || !pAway) return
    if (pHome === pAway) {
      setSimError('Selecciona equipos distintos')
      return
    }

    setIsSimulating(true)
    setSimError(null)
    setSimResult(null)

    try {
      const matchRef = latestMatches.find(m => m.home_team === pHome && m.away_team === pAway);
      const targetDate = matchRef ? matchRef.date : new Date().toISOString().split('T')[0];
      const targetHomeMatchNo = matchRef ? matchRef.home_match_no : (latestMatches.find(m => m.home_team === pHome)?.home_match_no || 46) + 1;
      const targetAwayMatchNo = matchRef ? matchRef.away_match_no : (latestMatches.find(m => m.away_team === pAway)?.away_match_no || 46) + 1;

      const parsedHomeOdds = Number(pOddsH);
      const parsedDrawOdds = Number(pOddsD);
      const parsedAwayOdds = Number(pOddsA);

      const oddsValid =
        Number.isFinite(parsedHomeOdds) && Number.isFinite(parsedDrawOdds) && Number.isFinite(parsedAwayOdds) &&
        parsedHomeOdds > 1 && parsedDrawOdds > 1 && parsedAwayOdds > 1

      if (!oddsValid) throw new Error("Cuotas inválidas (deben ser > 1.00)");

      const res = await fetch('http://localhost:8000/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate, 
          home_team: pHome,
          away_team: pAway,
          target_home_match_no: targetHomeMatchNo, 
          target_away_match_no: targetAwayMatchNo,
          home_odds: parsedHomeOdds,
          draw_odds: parsedDrawOdds,
          away_odds: parsedAwayOdds,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status} – ${body}`)
      }

      const data: PredictionResponse = await res.json()
      setSimResult(data)
    } catch (e) {
      setSimError(e instanceof Error ? e.message : 'Error al conectar con el backend')
    } finally {
      setIsSimulating(false)
    }
  }

  const handleQuickSimulate = (match: MatchRow, currentModel: ModelKey) => {
    setSimHomeTeam(match.home_team);
    setSimAwayTeam(match.away_team);
    setSimOddsHome(String(match.b365_odds.home));
    setSimOddsDraw(String(match.b365_odds.draw));
    setSimOddsAway(String(match.b365_odds.away));
    setSimModel(currentModel);

    handleSimulate({
      home: match.home_team,
      away: match.away_team,
      oddsH: String(match.b365_odds.home),
      oddsD: String(match.b365_odds.draw),
      oddsA: String(match.b365_odds.away),
      model: currentModel
    });

    document.getElementById('simulador-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  const simProbs = simResult?.probabilities?.[simModel]
  const simStakes = getModelStakes(simResult?.kelly_stakes, simModel)
  const simValues = simResult?.value_bets?.[simModel]
  const simModelKellyFraction = simResult?.kelly_stakes?.Kelly_Fraction_Used?.[simModel]
  const simHasKellyData = Boolean(simStakes && simValues)
  const parsedBankroll = parseFloat(bankroll.replace(',', '.'))
  const hasBankroll = Number.isFinite(parsedBankroll) && parsedBankroll > 0
  const activeBankroll = hasBankroll ? parsedBankroll : undefined

  const applyModelToAll = (model: ModelKey) => {
    setBulkModelActive(model)
    setRowModels(prev => {
      const next = { ...prev }
      latestMatches.forEach(m => {
        next[`${m.home_team}-${m.away_team}-${m.date}`] = model
      })
      return next
    })
  }

  /* ── Render ───────────────────────────────────────────────── */
  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-surface-base text-zinc-300 font-sans">
        <header className="sticky top-0 z-50 bg-surface-base/80 backdrop-blur-xl border-b border-zinc-800/50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center text-xs font-bold text-black shrink-0">
                CH
              </div>
              <span className="font-medium text-sm tracking-[0.15em] text-zinc-100">
                CHAMPIONSHIP HUB
              </span>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-zinc-800/50 rounded w-48"></div>
            <div className="h-96 bg-zinc-800/30 rounded-xl"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-base text-zinc-300 font-sans selection:bg-zinc-800">

      {/* ══════════════════════ HEADER ══════════════════════════ */}
      <header className="sticky top-0 z-50 bg-surface-base/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 pt-4 pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center text-xs font-bold text-black shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                CH
              </div>
              <span className="font-medium text-sm tracking-[0.15em] text-zinc-100">
                CHAMPIONSHIP HUB
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="bankroll" className="text-[10px] text-zinc-400 uppercase tracking-widest whitespace-nowrap">
                Tu banca
              </label>
              <div className="relative">
                <input
                  id="bankroll"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="Ej. 1000"
                  value={bankroll}
                  onChange={(e) => setBankroll(e.target.value)}
                  className="w-36 bg-surface-card border border-zinc-800 rounded-xl pl-3 pr-8 py-2 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">€</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-300 leading-relaxed max-w-3xl">
            Consulta la última jornada de la EFL Championship y compara las cuotas del mercado con nuestras predicciones.
            Elige el modelo que prefieras en cada partido — las cuotas en <span className="text-amber-400 font-medium">amarillo</span> señalan
            apuestas con valor; pasa el cursor sobre ellas para ver la cantidad sugerida según la fracción Kelly óptima de cada modelo.
          </p>
          {hasBankroll ? (
            <p className="mt-2 text-base text-zinc-200">
              Banca activa:{' '}
              <span className="font-semibold text-emerald-400 tabular-nums">{formatEuros(parsedBankroll)}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              Introduce tu banca arriba a la derecha para ver las apuestas en euros.
            </p>
          )}
        </div>
      </header>

      {/* ══════════════════════ MAIN ════════════════════════════ */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">

        {/* ── Toasts / Banners ── */}
        {initialError && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm flex items-center gap-3 backdrop-blur-md">
            <span className="text-lg">⚠️</span>
            <p>No se pudo cargar la jornada actual: {initialError}</p>
          </div>
        )}

        {/* ════════════ MATCHES TABLE ═════════════════════════ */}
        <section className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-xl font-bold tracking-wide text-zinc-100">
              Última Jornada
            </h1>
            <div className="flex items-center gap-3 ml-auto flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest whitespace-nowrap">
                  Modelo global
                </span>
                <div className="flex rounded-xl border border-zinc-800 overflow-hidden">
                  {(['Maher', 'Dixon', 'XGBoost'] as const).map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => applyModelToAll(model)}
                      disabled={isLoadingInitial || latestMatches.length === 0}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        bulkModelActive === model
                          ? 'bg-blue-600/20 text-blue-400 border-r border-zinc-800 last:border-r-0'
                          : 'bg-surface-card text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/60 border-r border-zinc-800 last:border-r-0'
                      }`}
                    >
                      {MODEL_LABELS[model]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs font-medium tracking-wider text-zinc-400 uppercase bg-surface-card px-3 py-1.5 rounded-full border border-zinc-800/50">
                EFL Championship
              </div>
            </div>
          </div>

          <div className="bg-surface-panel rounded-2xl border border-zinc-800/60 overflow-hidden shadow-2xl">
            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-surface-card text-zinc-400 text-[10px] uppercase tracking-widest border-b border-zinc-800/60">
                  <tr>
                    <th className="px-6 py-4 text-left font-medium">Fecha / Hora</th>
                    <th className="px-6 py-4 text-center font-medium">Partido</th>
                    <th className="px-6 py-4 text-center font-medium">
                      Bet365 <span className="text-zinc-600 ml-1">1|X|2</span>
                    </th>
                    <th className="px-6 py-4 text-center font-medium">Modelo</th>
                    <th className="px-6 py-4 text-center font-medium">
                      Cuota Predicha <span className="text-zinc-600 ml-1">1|X|2</span>
                    </th>
                    <th className="px-6 py-4 text-center font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {isLoadingInitial ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : latestMatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-400 text-sm">
                        No hay partidos disponibles en la base de datos.
                      </td>
                    </tr>
                  ) : (
                    latestMatches.map((m, i) => {
                      const rowKey = `${m.home_team}-${m.away_team}-${m.date}`
                      const rowModel = rowModels[rowKey] || 'Maher'
                      
                      // Extraer probabilidades con fallback seguro
                      const rowProbs = m.probabilities?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
                      
                      // Extraer Kellys y Values para B365 con fallback
                      const b365Stakes = m.b365_kelly?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
                      const b365Values = m.b365_values?.[rowModel] ?? { Home: false, Draw: false, Away: false }

                      return (
                        <tr key={i} className="hover:bg-zinc-900/40 transition-colors group">
                          <td className="px-6 py-4 text-zinc-300 whitespace-nowrap text-xs font-light">
                            {m.date} {m.time}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-3 whitespace-nowrap">
                              <span className="text-zinc-200 font-medium text-right w-24">{m.home_team}</span>
                              <TeamBadge teamName={m.home_team} />
                              <span className="text-zinc-500 text-xs font-light">vs</span>
                              <TeamBadge teamName={m.away_team} />
                              <span className="text-zinc-200 font-medium text-left w-24">{m.away_team}</span>
                            </div>
                          </td>
                          
                          {/* Celda Bet365 con sus propios cálculos */}
                          <OddsCell odds={m.b365_odds} stakes={b365Stakes} values={b365Values} bankroll={activeBankroll} />
                          
                          <td className="px-6 py-4 text-center">
                            <select
                              value={rowModel}
                              onChange={(e) =>
                                setRowModels(prev => ({
                                  ...prev,
                                  [rowKey]: e.target.value as ModelKey
                                }))
                              }
                              className="appearance-none bg-surface-card border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all cursor-pointer"
                            >
                              <option value="Maher">Maher</option>
                              <option value="Dixon">Dixon-Coles</option>
                              <option value="XGBoost">XGBoost</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-center tabular-nums whitespace-nowrap text-xs">
                            <span className="text-zinc-200 font-medium">{toOdds(rowProbs.Home)}</span>
                            <span className="text-zinc-700 mx-1.5">|</span>
                            <span className="text-zinc-200 font-medium">{toOdds(rowProbs.Draw)}</span>
                            <span className="text-zinc-700 mx-1.5">|</span>
                            <span className="text-zinc-200 font-medium">{toOdds(rowProbs.Away)}</span>
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleQuickSimulate(m, rowModel)}
                              className="bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-500 text-[10px] uppercase font-bold px-3 py-1.5 rounded-lg border border-emerald-500/30 transition-colors"
                            >
                              SIMULAR
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ════════════ SIMULATOR ══════════════════════════════ */}
        <section id="simulador-section" className="space-y-6 scroll-mt-24">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-wide text-zinc-100">
              Simulador
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* ── Controls panel ── */}
            <div className="lg:col-span-4 bg-surface-panel border border-zinc-800/60 rounded-2xl p-6 shadow-2xl flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase tracking-widest mb-2 font-medium">Equipo Local</label>
                  <select
                    value={simHomeTeam}
                    onChange={(e) => setSimHomeTeam(e.target.value)}
                    disabled={!!isLoadingInitial}
                    className="w-full bg-surface-card border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none appearance-none disabled:opacity-50"
                  >
                    <option value="" disabled>Selecciona un equipo</option>
                    {teams.map(t => <option key={`h-${t}`} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase tracking-widest mb-2 font-medium">Equipo Visitante</label>
                  <select
                    value={simAwayTeam}
                    onChange={(e) => setSimAwayTeam(e.target.value)}
                    disabled={!!isLoadingInitial}
                    className="w-full bg-surface-card border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none appearance-none disabled:opacity-50"
                  >
                    <option value="" disabled>Selecciona un equipo</option>
                    {teams.map(t => <option key={`a-${t}`} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase tracking-widest mb-2 font-medium">Modelo Predictivo</label>
                  <select
                    value={simModel}
                    onChange={(e) => setSimModel(e.target.value as ModelKey)}
                    className="w-full bg-surface-card border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none appearance-none"
                  >
                    <option value="" disabled>Selecciona un modelo</option>
                    <option value="Maher">Maher (Poisson Estático)</option>
                    <option value="Dixon">Dixon-Coles (Dinámico)</option>
                    <option value="XGBoost">XGBoost (Gradient Boosting)</option>
                  </select>
                </div>
              </div>

              <div>
                  <label className="block text-[10px] text-zinc-400 uppercase tracking-widest mb-2 font-medium">Cuotas de tu Casa (1 | X | 2)</label>
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      type="number" step="0.01" min="1.01"
                      value={simOddsHome}
                      onChange={(e) => setSimOddsHome(e.target.value)}
                      className="w-full bg-surface-card border border-zinc-800 rounded-xl px-3 py-2.5 text-center text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <input
                      type="number" step="0.01" min="1.01"
                      value={simOddsDraw}
                      onChange={(e) => setSimOddsDraw(e.target.value)}
                      className="w-full bg-surface-card border border-zinc-800 rounded-xl px-3 py-2.5 text-center text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <input
                      type="number" step="0.01" min="1.01"
                      value={simOddsAway}
                      onChange={(e) => setSimOddsAway(e.target.value)}
                      className="w-full bg-surface-card border border-zinc-800 rounded-xl px-3 py-2.5 text-center text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

              <div className="space-y-3">
                {simError && (
                  <div className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                    {simError}
                  </div>
                )}
                <button
                  onClick={() => handleSimulate()}
                  disabled={!!(isSimulating || isLoadingInitial)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:shadow-none"
                >
                  {isSimulating ? 'Calculando...' : 'Ejecutar Simulación'}
                </button>
              </div>
            </div>

            {/* ── Results panel ── */}
            <div className="lg:col-span-8 bg-surface-panel border border-zinc-800/60 rounded-2xl p-8 shadow-2xl flex flex-col justify-center min-h-[320px]">
              {isSimulating ? (
                <div className="flex flex-col items-center justify-center space-y-4 animate-pulse">
                  <div className="w-12 h-12 border-2 border-zinc-600 border-t-zinc-100 rounded-full animate-spin"></div>
                  <p className="text-zinc-500 text-sm tracking-widest uppercase">Procesando Modelos</p>
                </div>
              ) : simResult && simProbs && simHasKellyData ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="text-center space-y-3">
                    <div className="flex items-center justify-center gap-4">
                      <TeamBadge teamName={simResult.match.split(' vs ')[0] || ''} />
                      <h3 className="text-2xl font-medium text-zinc-100 tracking-tight">
                        {simResult.match.split(' vs ')[0]} <span className="text-zinc-600 font-light mx-2">vs</span> {simResult.match.split(' vs ')[1]}
                      </h3>
                      <TeamBadge teamName={simResult.match.split(' vs ')[1] || ''} />
                    </div>
                    <p className="text-zinc-400 text-sm font-light">
                      Modelo: <span className="text-zinc-200 font-medium">{simModel}</span>
                    </p>
                  </div>

                  {/* Probability bar */}
                  <div className="space-y-3 max-w-2xl mx-auto w-full">
                    <div className="flex h-4 w-full rounded-full overflow-hidden bg-zinc-900 mt-2">
                      <div className="bg-blue-500 transition-all duration-1000 ease-out" style={{ width: `${simProbs.Home * 100}%` }} />
                      <div className="bg-zinc-500 transition-all duration-1000 ease-out" style={{ width: `${simProbs.Draw * 100}%` }} />
                      <div className="bg-rose-500 transition-all duration-1000 ease-out" style={{ width: `${simProbs.Away * 100}%` }} />
                    </div>

                    <div className="flex justify-between text-sm font-medium pt-1">
                      <div className="flex flex-col items-start">
                        <span className="text-blue-500">{toPct(simProbs.Home)}</span>
                        <span className="text-blue-500 text-[10px] uppercase tracking-widest mt-1">Local</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-zinc-500">{toPct(simProbs.Draw)}</span>
                        <span className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">Empate</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-rose-500">{toPct(simProbs.Away)}</span>
                        <span className="text-rose-500 text-[10px] uppercase tracking-widest mt-1">Visitante</span>
                      </div>
                    </div>
                  </div>

                  {/* Kelly Stakes */}
                  <div className="pt-8 border-t border-zinc-800/50 max-w-2xl mx-auto w-full">
                    <p className="text-center text-[10px] text-zinc-400 uppercase tracking-widest mb-2 font-medium">
                      {hasBankroll ? 'Apuesta sugerida (Kelly)' : 'Kelly Stakes Sugeridos'}
                    </p>
                    {simModelKellyFraction !== undefined && (
                      <p className="text-center text-xs text-zinc-400 mb-4">
                        Fracción óptima de la estrategia de Kelly para este modelo:{' '}
                        <span className="text-zinc-200 font-medium tabular-nums">
                          {toKellyPct(simModelKellyFraction)}
                        </span>
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-4">
                      {(
                        [
                          { key: 'Home' as const },
                          { key: 'Draw' as const },
                          { key: 'Away' as const },
                        ] as const
                      ).map(({ key }) => {
                        const stake = parseOutcomeStake(simStakes, key)
                        const isValue = parseOutcomeValue(simValues, key)
                        const stakePct = toKellyPct(stake)
                        const stakeEuros = hasBankroll ? formatEuros(stake * parsedBankroll) : null
                        const label = OUTCOME_LABELS[key]

                        if (!isValue) {
                          return (
                            <div
                              key={key}
                              className="bg-surface-card border border-rose-500/20 rounded-xl p-4 flex flex-col items-center justify-center min-h-[100px]"
                            >
                              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">{label}</div>
                              <p className="text-sm text-rose-400 text-center leading-snug">
                                Apuesta a <span className="font-bold">{NO_BET_LABELS[key]}</span> no recomendada por el modelo.
                              </p>
                            </div>
                          )
                        }

                        return (
                          <div key={key} className="bg-surface-card border border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.1)] rounded-xl p-4 flex flex-col items-center transition-colors">
                            <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">{label}</div>
                            {hasBankroll && stake > STAKE_EPSILON && (
                              <div className="text-amber-400 text-xl font-bold tabular-nums drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] mb-2">
                                {stakeEuros}
                              </div>
                            )}
                            <div className="text-sm tabular-nums text-amber-400">
                              <span className="text-zinc-400">Fracción Kelly: </span>
                              <span className="font-bold">{stakePct}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4 opacity-60">
                  <div className="w-16 h-16 mx-auto bg-surface-card border border-zinc-800/50 rounded-2xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-zinc-300 text-sm font-light">Configura los parámetros y ejecuta la simulación</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ══════════════════════ FOOTER ══════════════════════════ */}
      <footer className="mt-12 py-8 border-t border-zinc-800/50 bg-surface-base">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-zinc-500 font-light">
          <p>© 2025 Championship Hub</p>
          <p>Modelos Predictivos</p>
        </div>
      </footer>
    </div>
  )
}
