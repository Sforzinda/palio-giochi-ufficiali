import { Flag, Medal, Sparkles } from 'lucide-react';
import { PalioWinnerCelebration } from '../components/PalioWinnerCelebration';
import sforzindaLogo from '../assets/sforzinda-logo-inverted.png';
import { getContradaStemma } from '../lib/contrada-stemmi';
import {
  palioGameLabels,
  formatNumber,
  getResultValue,
  getResultPositionLabel,
  usePalioLiveData
} from '../hooks/usePalioLiveData';

export function PalioLiveMobile() {
  const {
    contrade,
    control,
    edition,
    expectedGames,
    gameResultsGroups,
    heatGames,
    heatGroupsByGame,
    liveTitle,
    loading,
    ranking,
    showPartialRanking,
    showTotalRanking,
    tripliceTenzone,
    tripliceWinner,
    tripliceWinnerResult
  } = usePalioLiveData('palio-live-mobile-page');

  const isActive = !loading && control && edition && (
    tripliceWinner || control.show_heats || control.show_games || control.show_partial_ranking || control.show_total_ranking
  );

  return (
    <div className="min-h-screen bg-[#180f0a] text-amber-50">
      <div className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,#7a2f18_0,#2a140c_34%,#120b08_72%)]">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(90deg,rgba(255,244,194,.12)_1px,transparent_1px),linear-gradient(rgba(255,244,194,.12)_1px,transparent_1px)] [background-size:42px_42px]" />

        <header className="relative z-10 flex items-center justify-between gap-3 border-b border-amber-200/20 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">
              <Flag className="h-3 w-3 shrink-0" />
              Diretta Palio di Vigevano
            </div>
            <h1 className="truncate text-xl font-black text-amber-100 sm:text-2xl">
              {liveTitle}
            </h1>
          </div>
          <img src={sforzindaLogo} alt="Sforzinda" className="h-8 w-8 shrink-0 object-contain" />
        </header>

        <main className="relative z-10 space-y-3 p-3 pb-8">
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-amber-200/20 bg-black/20 py-16">
              <p className="text-base font-semibold text-amber-100">Caricamento diretta...</p>
            </div>
          ) : !isActive ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200/20 bg-black/20 py-16 text-center">
              <Sparkles className="h-10 w-10 text-amber-300" />
              <h2 className="mt-3 text-2xl font-black text-amber-100">Diretta non attiva</h2>
              <p className="mt-1.5 px-6 text-sm text-amber-100/70">I risultati saranno visibili quando la regia abiliterà la schermata.</p>
            </div>
          ) : (
            <>
              {tripliceWinner && (
                <PalioWinnerCelebration result={tripliceWinnerResult} variant="mobile" winner={tripliceWinner} />
              )}

              {/* Triplice tenzone */}
              {!tripliceWinner && tripliceTenzone.length > 0 && (
                <section className="rounded-xl border border-amber-200/25 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/60">Triplice tenzone</div>
                  <div className="space-y-1.5">
                    {tripliceTenzone.map((item) => (
                      <div key={item.id} className="grid grid-cols-[28px_minmax(0,1fr)_56px] items-center gap-2 rounded-lg bg-amber-50/10 px-3 py-2">
                        <span className="text-lg font-black text-amber-300">{item.rank}</span>
                        <span className="truncate text-sm font-bold text-amber-50">{item.name}</span>
                        <span className="text-right text-sm font-black text-amber-200">{item.totalPoints.toLocaleString('it-IT')}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Batterie */}
              {!tripliceWinner && control?.show_heats && heatGames.length > 0 && heatGames.map((game) => {
                const groups = heatGroupsByGame.get(game) ?? [];
                return (
                  <section key={`heats-${game}`} className="rounded-xl border border-amber-200/25 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-lg font-black text-amber-100">Batterie — {palioGameLabels[game]}</h2>
                      <span className="rounded-md border border-amber-200/25 px-2 py-0.5 text-xs font-semibold text-amber-100/70">Prima dei giochi</span>
                    </div>
                    <div className="space-y-2">
                      {groups.map((group) => (
                        <div key={group.heatNumber} className="rounded-lg border border-amber-200/15 bg-amber-50/5 p-2.5">
                          <div className="mb-2 border-b border-amber-200/15 pb-1.5">
                            <h3 className="text-base font-black text-amber-100">Batteria {group.heatNumber}</h3>
                          </div>
                          <div className="space-y-1.5">
                            {group.items.map((heat) => {
                              const heatContradaName = contrade.find((c) => c.id === heat.contrada_id)?.name ?? 'Contrada';
                              const heatStemma = getContradaStemma(heatContradaName);

                              return (
                              <div key={heat.contrada_id} className="grid grid-cols-[32px_minmax(0,1fr)_52px] items-center gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-base font-black text-amber-300">{heat.display_order}</span>
                                <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-amber-50">
                                  {heatStemma && (
                                    <img src={heatStemma} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-amber-200/30" />
                                  )}
                                  <span className="truncate">{heatContradaName}</span>
                                </span>
                                {heat.no_players && (
                                  <span className="rounded bg-red-600/80 px-1.5 py-0.5 text-center text-xs font-black text-white">N.A.</span>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* Risultati prove */}
              {!tripliceWinner && control?.show_games && gameResultsGroups.length > 0 && (
                <section className="rounded-xl border border-amber-200/25 bg-black/20 p-3">
                  <h2 className="mb-3 text-lg font-black text-amber-100">Risultati prove</h2>
                  <div className="space-y-3">
                    {gameResultsGroups.map((group) => (
                      <div key={group.game} className="rounded-lg border border-amber-200/15 bg-amber-50/5 p-2.5">
                        <div className="mb-2 flex items-center justify-between border-b border-amber-200/15 pb-1.5">
                          <h3 className="text-base font-black text-amber-100">{palioGameLabels[group.game]}</h3>
                          <span className="text-xs font-semibold text-amber-200/60">{group.results.length}/{contrade.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {group.results.map((result) => {
                            const contrada = contrade.find((item) => item.id === result.contrada_id);
                            const stemma = getContradaStemma(contrada?.name);
                            return (
                              <div key={`${result.game}-${result.contrada_id}`} className="grid grid-cols-[minmax(0,1fr)_52px_70px] items-center gap-2 rounded-md bg-black/20 px-2 py-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  {stemma && (
                                    <img src={stemma} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-amber-200/30" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-black text-amber-50">{contrada?.name ?? 'Contrada'}</div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/50">{getResultPositionLabel(result)}</div>
                                  </div>
                                </div>
                                <div className="text-right text-base font-black text-amber-300">{formatNumber(result.points)}</div>
                                <div className="truncate text-right text-xs font-semibold text-amber-100/70">{getResultValue(result)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Classifica parziale */}
              {!tripliceWinner && showPartialRanking && (
                <section className="rounded-xl border border-amber-200/25 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-black text-amber-100">Classifica parziale</h2>
                    <Medal className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="space-y-1.5">
                    {ranking.map((item) => {
                      const stemma = getContradaStemma(item.name);
                      return (
                      <div key={item.id} className="grid grid-cols-[36px_minmax(0,1fr)_64px] items-center gap-2 rounded-lg bg-amber-50/8 px-2.5 py-2.5">
                        <span className="text-xl font-black text-amber-300">{item.rank}</span>
                        <div className="flex min-w-0 items-center gap-1.5">
                          {stemma && (
                            <img src={stemma} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-amber-200/30" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-amber-50">{item.name}</div>
                            <div className="text-[10px] text-amber-100/50">{item.completedGames}/{expectedGames.length} prove</div>
                          </div>
                        </div>
                        <div className="text-right text-base font-black text-amber-100">{item.totalPoints.toLocaleString('it-IT')}</div>
                      </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Classifica finale */}
              {!tripliceWinner && showTotalRanking && (
                <section className="rounded-xl border border-amber-200/25 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-black text-amber-100">Classifica finale</h2>
                    <Medal className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="space-y-1.5">
                    {ranking.map((item) => {
                      const stemma = getContradaStemma(item.name);
                      return (
                      <div key={item.id} className="grid grid-cols-[36px_minmax(0,1fr)_64px] items-center gap-2 rounded-lg bg-amber-50/8 px-2.5 py-2.5">
                        <span className="text-xl font-black text-amber-300">{item.rank}</span>
                        <div className="flex min-w-0 items-center gap-1.5">
                          {stemma && (
                            <img src={stemma} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-amber-200/30" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-amber-50">{item.name}</div>
                            <div className="text-[10px] text-amber-100/50">{item.completedGames}/{expectedGames.length} prove</div>
                          </div>
                        </div>
                        <div className="text-right text-base font-black text-amber-100">{item.totalPoints.toLocaleString('it-IT')}</div>
                      </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
