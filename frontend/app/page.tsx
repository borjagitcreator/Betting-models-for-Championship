'use client'

import { useState, useEffect } from 'react'

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

interface MatchRow {
  date: string
  time: string
  home_team: string
  away_team: string
  home_match_no: number
  away_match_no: number
  b365_odds: OddsTriple
  pinnacle_odds: OddsTriple
  probabilities: {
    Maher: Probs
    Dixon: Probs
  }
}

interface PredictionResponse {
  match: string
  date: string
  probabilities: {
    Maher: Probs
    Dixon: Probs
  }
  kelly_stakes: {
    Maher: Probs
    Dixon: Probs
    Kelly_Fraction_Used: number
  }
}

type ModelKey = 'Maher' | 'Dixon'

/* ─────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────── */
const toOdds = (p: number) => (p > 0.001 ? (1 / p).toFixed(2) : '∞')
const toPct = (p: number) => `${(p * 100).toFixed(1)}%`

function OddsCell({ h, d, a }: { h: number; d: number; a: number }) {
  return (
    <td className="px-6 py-4 text-center tabular-nums whitespace-nowrap text-xs">
      <span className="text-zinc-200">{h.toFixed(2)}</span>
      <span className="text-zinc-700 mx-1.5">|</span>
      <span className="text-zinc-200">{d.toFixed(2)}</span>
      <span className="text-zinc-700 mx-1.5">|</span>
      <span className="text-zinc-200">{a.toFixed(2)}</span>
    </td>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/50">
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-40 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-6 bg-zinc-800/50 rounded animate-pulse w-32 mx-auto"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-zinc-800/50 rounded animate-pulse w-24 mx-auto"></div></td>
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
  /* Hydration State */
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
  }, [])

  /* Initial Data State */
  const [latestMatches, setLatestMatches] = useState<MatchRow[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [isLoadingInitial, setIsLoadingInitial] = useState(true)
  const [initialError, setInitialError] = useState<string | null>(null)

  /* Per-row model selector state */
  const [rowModels, setRowModels] = useState<Record<number, ModelKey>>({})

  /* Simulator State */
  const [simHomeTeam, setSimHomeTeam] = useState<string>('')
  const [simAwayTeam, setSimAwayTeam] = useState<string>('')
  const [simModel, setSimModel] = useState<ModelKey>('Maher')
  const [simOddsHome, setSimOddsHome] = useState<string>('2.50')
  const [simOddsDraw, setSimOddsDraw] = useState<string>('3.20')
  const [simOddsAway, setSimOddsAway] = useState<string>('2.80')
  const [simResult, setSimResult] = useState<PredictionResponse | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

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
        // No necesitamos teamsRes, extraemos los 24 equipos únicos de los partidos actuales
        const currentActiveTeams = Array.from(
          new Set(matchesData.flatMap(m => [m.home_team, m.away_team]))
        ).sort()
  
        setLatestMatches(matchesData)
        setTeams(currentActiveTeams) 
          
        // Initialize row models
        const initialRowModels: Record<number, ModelKey> = {}
        matchesData.forEach((_, i) => {
          initialRowModels[i] = 'Maher'
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
  const handleSimulate = async () => {
    if (!simHomeTeam || !simAwayTeam) return
    if (simHomeTeam === simAwayTeam) {
      setSimError('Selecciona equipos distintos')
      return
    }

    setIsSimulating(true)
    setSimError(null)
    setSimResult(null)

    try {
      // Find the latest match numbers for these teams to simulate a future match
      const homeMatchNo = latestMatches.find(m => m.home_team === simHomeTeam)?.home_match_no || 46
      const awayMatchNo = latestMatches.find(m => m.away_team === simAwayTeam)?.away_match_no || 46

      const res = await fetch('http://localhost:8000/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          home_team: simHomeTeam,
          away_team: simAwayTeam,
          target_home_match_no: homeMatchNo + 1,
          target_away_match_no: awayMatchNo + 1,
          home_odds: parseFloat(simOddsHome) || 1.01,
          draw_odds: parseFloat(simOddsDraw) || 1.01,
          away_odds: parseFloat(simOddsAway) || 1.01,
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

  const simProbs = simResult?.probabilities[simModel]

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface-base text-zinc-300 font-sans selection:bg-zinc-800">

      {/* ══════════════════════ HEADER ══════════════════════════ */}
      <header className="sticky top-0 z-50 bg-surface-base/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center text-xs font-bold text-black shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              CH
            </div>
            <span className="font-medium text-sm tracking-[0.15em] text-zinc-100">
              CHAMPIONSHIP HUB
            </span>
          </div>
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
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-medium tracking-wide text-zinc-100">
              <b>Última Jornada</b>
            </h1>
            <div className="text-xs font-medium tracking-wider text-zinc-500 uppercase bg-surface-card px-3 py-1.5 rounded-full border border-zinc-800/50">
              EFL Championship
            </div>
          </div>

          <div className="bg-surface-panel rounded-2xl border border-zinc-800/60 overflow-hidden shadow-2xl">
            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-surface-card text-zinc-500 text-[10px] uppercase tracking-widest border-b border-zinc-800/60">
                  <tr>
                    <th className="px-6 py-4 text-left font-medium">Fecha / Hora</th>
                    <th className="px-6 py-4 text-center font-medium">Partido</th>
                    <th className="px-6 py-4 text-center font-medium">
                      Bet365 <span className="text-zinc-700 ml-1">1|X|2</span>
                    </th>
                    <th className="px-6 py-4 text-center font-medium">
                      Pinnacle <span className="text-zinc-700 ml-1">1|X|2</span>
                    </th>
                    <th className="px-6 py-4 text-center font-medium">Modelo</th>
                    <th className="px-6 py-4 text-center font-medium">
                      Cuota Predicha <span className="text-zinc-700 ml-1">1|X|2</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {isLoadingInitial ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : latestMatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 text-sm">
                        No hay partidos disponibles en la base de datos.
                      </td>
                    </tr>
                  ) : (
                    latestMatches.map((m, i) => {
                      const rowModel = rowModels[i] || 'Maher'
                      const rowProbs = m.probabilities[rowModel]

                      return (
                        <tr key={i} className="hover:bg-zinc-900/40 transition-colors group">
                          <td className="px-6 py-4 text-zinc-400 whitespace-nowrap text-xs font-light">
                            {m.date} {m.time}
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-3">
                              <TeamBadge teamName={m.home_team} />
                              <span className="text-zinc-200 font-medium w-24 text-right">{m.home_team}</span>
                              <span className="text-zinc-600 text-[10px] font-light">vs</span>
                              <span className="text-zinc-200 font-medium w-24 text-left">{m.away_team}</span>
                              <TeamBadge teamName={m.away_team} />
                            </div>
                          </td>
                          <OddsCell h={m.b365_odds.home} d={m.b365_odds.draw} a={m.b365_odds.away} />
                          <OddsCell h={m.pinnacle_odds.home} d={m.pinnacle_odds.draw} a={m.pinnacle_odds.away} />
                          <td className="px-6 py-4 text-center">
                            <select
                              value={rowModel}
                              onChange={(e) => setRowModels(prev => ({ ...prev, [i]: e.target.value as ModelKey }))}
                              className="appearance-none bg-surface-card border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all cursor-pointer"
                            >
                              <option value="Maher">Maher</option>
                              <option value="Dixon">Dixon-Coles</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-center tabular-nums whitespace-nowrap text-xs">
                            <span className="text-zinc-200 font-medium">{toOdds(rowProbs.Home)}</span>
                            <span className="text-zinc-700 mx-1.5">|</span>
                            <span className="text-zinc-200 font-medium">{toOdds(rowProbs.Draw)}</span>
                            <span className="text-zinc-700 mx-1.5">|</span>
                            <span className="text-zinc-200 font-medium">{toOdds(rowProbs.Away)}</span>
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
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium tracking-wide text-zinc-100">
              <b>Simulador Independiente</b>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* ── Controls panel ── */}
            <div className="lg:col-span-4 bg-surface-panel border border-zinc-800/60 rounded-2xl p-6 shadow-2xl flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Equipo Local</label>
                  <select
                    value={simHomeTeam}
                    onChange={(e) => setSimHomeTeam(e.target.value)}
                    disabled={!isMounted || isLoadingInitial}
                    className="w-full bg-surface-card border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none appearance-none disabled:opacity-50"
                  >
                    {teams.map(t => <option key={`h-${t}`} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Equipo Visitante</label>
                  <select
                    value={simAwayTeam}
                    onChange={(e) => setSimAwayTeam(e.target.value)}
                    disabled={!isMounted || isLoadingInitial}
                    className="w-full bg-surface-card border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none appearance-none disabled:opacity-50"
                  >
                    {teams.map(t => <option key={`a-${t}`} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Modelo Predictivo</label>
                  <select
                    value={simModel}
                    onChange={(e) => setSimModel(e.target.value as ModelKey)}
                    className="w-full bg-surface-card border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none appearance-none"
                  >
                    <option value="Maher">Maher (Poisson Estático)</option>
                    <option value="Dixon">Dixon-Coles (Dinámico)</option>
                  </select>
                </div>
              </div>

              <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Cuotas de tu Casa (1 | X | 2)</label>
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
                  onClick={handleSimulate}
                  disabled={!isMounted || isSimulating || isLoadingInitial}
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
              ) : simResult && simProbs ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="text-center space-y-3">
                    <div className="flex items-center justify-center gap-4">
                      <TeamBadge teamName={simResult.match.split(' vs ')[0]} />
                      <h3 className="text-2xl font-medium text-zinc-100 tracking-tight">
                        {simResult.match.split(' vs ')[0]} <span className="text-zinc-600 font-light mx-2">vs</span> {simResult.match.split(' vs ')[1]}
                      </h3>
                      <TeamBadge teamName={simResult.match.split(' vs ')[1]} />
                    </div>
                    <p className="text-zinc-500 text-sm font-light">
                      Modelo: <span className="text-zinc-300 font-medium">{simModel}</span>
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
                    <p className="text-center text-[10px] text-zinc-500 uppercase tracking-widest mb-6 font-medium">
                      Kelly Stakes Sugeridos (Fracción: {(simResult.kelly_stakes.Kelly_Fraction_Used * 100).toFixed(0)}%)
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      {(
                        [
                          { key: 'Home' as const, label: 'Local' },
                          { key: 'Draw' as const, label: 'Empate' },
                          { key: 'Away' as const, label: 'Visitante' },
                        ] as const
                      ).map(({ key, label }) => {
                        const stake = simResult.kelly_stakes[simModel][key]
                        const hasValue = stake > 0
                        return (
                          <div key={key} className="bg-surface-card border border-zinc-800/60 rounded-xl p-4 flex flex-col items-center">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">{label}</div>
                            <div className={hasValue ? "text-emerald-400 text-xl font-bold tabular-nums" : "text-zinc-600 text-xl tabular-nums"}>
                              {hasValue ? `${(stake * 100).toFixed(1)}%` : '0.0%'}
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
                  <p className="text-zinc-400 text-sm font-light">Configura los parámetros y ejecuta la simulación</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ══════════════════════ FOOTER ══════════════════════════ */}
      <footer className="mt-12 py-8 border-t border-zinc-800/50 bg-surface-base">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-zinc-600 font-light">
          <p>© 2025 Championship Hub</p>
          <p>Modelos Predictivos</p>
        </div>
      </footer>
    </div>
  )
}
