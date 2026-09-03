import { useEffect, useMemo, useState } from 'react';
import { Flag, Medal, Sparkles } from 'lucide-react';
import { PalioWinnerCelebration } from '../components/PalioWinnerCelebration';
import sforzindaLogo from '../assets/sforzinda-logo-inverted.png';
import { getContradaStemma } from '../lib/contrada-stemmi';
import {
  type PalioGame,
  palioGameLabels,
  formatNumber,
  getResultValue,
  getResultPositionLabel,
  usePalioLiveData
} from '../hooks/usePalioLiveData';

// Nota: a differenza della versione originale in fantapalio, questo componente
// non include le "sfide" (QR code per punti Fanta) — feature di gamification
// del Fanta, non un risultato ufficiale del Palio. Niente SEO interno: la
// pagina consumatrice gestisce il proprio <head>.

type LiveSection = `heats-${PalioGame}` | `games-${number}` | 'partial' | 'total';

export function PalioLive() {
  const {
    contrade,
    control,
    edition,
    expectedGames,
    gameResultsGroups,
    gameResultsPages,
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
  } = usePalioLiveData('palio-live-page');

  const [sectionIndex, setSectionIndex] = useState(0);

  const visibleSections = useMemo(() => {
    const sections: LiveSection[] = [];
    if (control?.show_heats) {
      heatGames.forEach((game) => {
        sections.push(`heats-${game}`);
      });
    }
    if (control?.show_games) {
      const pageCount = Math.max(gameResultsPages.length, 1);
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        sections.push(`games-${pageIndex}`);
      }
    }
    if (showPartialRanking) {
      sections.push('partial');
    }
    if (showTotalRanking) {
      sections.push('total');
    }
    return sections;
  }, [control, gameResultsPages.length, heatGames, showPartialRanking, showTotalRanking]);

  const visibleSectionsKey = visibleSections.join('|');

  useEffect(() => {
    setSectionIndex(0);
  }, [visibleSectionsKey]);

  useEffect(() => {
    if (visibleSections.length <= 1) return;
    const timer = window.setInterval(() => {
      setSectionIndex((current) => (current + 1) % visibleSections.length);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [visibleSections.length]);

  const activeSection = visibleSections[sectionIndex] ?? visibleSections[0] ?? null;
  const isHeatsSection = activeSection?.startsWith('heats-') ?? false;
  const activeHeatGame = isHeatsSection
    ? activeSection.replace('heats-', '') as PalioGame
    : null;
  const activeHeatGroups = activeHeatGame ? heatGroupsByGame.get(activeHeatGame) ?? [] : [];
  const isGamesSection = activeSection?.startsWith('games-') ?? false;
  const activeGamePageIndex = isGamesSection
    ? Number.parseInt(activeSection.replace('games-', ''), 10)
    : 0;
  const activeGameGroups = gameResultsPages[Number.isNaN(activeGamePageIndex) ? 0 : activeGamePageIndex] ?? [];

  return (
    <div className="h-screen overflow-hidden bg-[#180f0a] text-amber-50">
      <div className="relative flex h-full flex-col bg-[radial-gradient(circle_at_top_left,#7a2f18_0,#2a140c_34%,#120b08_72%)]">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(90deg,rgba(255,244,194,.12)_1px,transparent_1px),linear-gradient(rgba(255,244,194,.12)_1px,transparent_1px)] [background-size:42px_42px]" />
        <header className="relative z-10 flex items-center justify-between gap-4 border-b border-amber-200/20 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/80">
              <Flag className="h-4 w-4" />
              Diretta giochi del Palio di Vigevano
            </div>
            <h1 className="truncate text-2xl font-black text-amber-100 sm:text-4xl">
              {liveTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {tripliceTenzone.length > 0 && (
              <div className="hidden rounded-md border border-amber-200/30 bg-amber-100/10 px-4 py-2 text-right md:block">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Triplice tenzone</div>
                <div className="mt-1 flex gap-2 text-sm font-bold text-amber-100 xl:gap-3">
                  {tripliceTenzone.map((item) => (
                    <div key={item.id} className="grid min-w-[110px] grid-cols-[20px_minmax(0,1fr)_44px] items-center gap-1 rounded bg-black/20 px-2 py-1">
                      <span className="text-amber-300">{item.rank}</span>
                      <span className="truncate">{item.name}</span>
                      <span className="text-right text-amber-200">{item.totalPoints.toLocaleString('it-IT')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <img src={sforzindaLogo} alt="Sforzinda" className="h-10 w-10 object-contain sm:h-12 sm:w-12" />
          </div>
        </header>

        <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:p-4">
          {loading ? (
            <section className="flex min-h-0 items-center justify-center rounded-md border border-amber-200/20 bg-black/20">
              <div className="text-xl font-semibold text-amber-100">Caricamento diretta...</div>
            </section>
          ) : !control || !edition || (!tripliceWinner && visibleSections.length === 0) ? (
            <section className="flex min-h-0 items-center justify-center rounded-md border border-amber-200/20 bg-black/20 text-center">
              <div>
                <Sparkles className="mx-auto h-12 w-12 text-amber-300" />
                <h2 className="mt-4 text-3xl font-black text-amber-100">Diretta non attiva</h2>
                <p className="mt-2 text-amber-100/70">I risultati saranno visibili quando la regia abiliterà la schermata.</p>
              </div>
            </section>
          ) : (
            <section className="min-h-0 rounded-md border border-amber-200/25 bg-black/20 p-3 shadow-2xl shadow-black/30 sm:p-4">
              {tripliceWinner && (
                <PalioWinnerCelebration result={tripliceWinnerResult} winner={tripliceWinner} />
              )}

              {!tripliceWinner && isHeatsSection && activeHeatGame && (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-black text-amber-100 sm:text-4xl">
                      Batterie - {palioGameLabels[activeHeatGame]}
                    </h2>
                    <span className="rounded-md border border-amber-200/30 px-3 py-1 text-sm font-semibold text-amber-100/80">
                      Prima dei giochi
                    </span>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-2 xl:grid-cols-4">
                    {activeHeatGroups.map((group) => (
                      <div key={group.heatNumber} className="min-h-0 rounded-md border border-amber-200/20 bg-amber-50/10 p-3">
                        <div className="mb-3 border-b border-amber-200/20 pb-2">
                          <h3 className="text-2xl font-black text-amber-100">Batteria {group.heatNumber}</h3>
                        </div>
                        <div className="space-y-2">
                          {group.items.map((heat) => {
                            const heatContradaName = contrade.find((contrada) => contrada.id === heat.contrada_id)?.name ?? 'Contrada';
                            const heatStemma = getContradaStemma(heatContradaName);

                            return (
                            <div key={heat.contrada_id} className="grid grid-cols-[36px_minmax(0,1fr)_64px] items-center gap-2 rounded-md bg-black/20 px-2 py-2">
                              <div className="text-2xl font-black text-amber-300">{heat.display_order}</div>
                              <div className="flex min-w-0 items-center gap-2">
                                {heatStemma && (
                                  <img src={heatStemma} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-amber-200/30" />
                                )}
                                <div className="truncate text-xl font-black text-amber-50">{heatContradaName}</div>
                              </div>
                              {heat.no_players && (
                                <div className="rounded bg-red-600/80 px-2 py-1 text-center text-sm font-black text-white">N.A.</div>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!tripliceWinner && isGamesSection && (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-black text-amber-100 sm:text-4xl">Risultati prove</h2>
                    <span className="rounded-md border border-amber-200/30 px-3 py-1 text-sm font-semibold text-amber-100/80">
                      {gameResultsPages.length > 1 ? `${activeGamePageIndex + 1}/${gameResultsPages.length}` : 'Live'}
                    </span>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-2">
                    {activeGameGroups.map((group) => (
                      <div key={group.game} className="min-h-0 rounded-md border border-amber-200/20 bg-amber-50/10 p-3">
                        <div className="mb-2 flex items-center justify-between border-b border-amber-200/20 pb-2">
                          <h3 className="text-2xl font-black text-amber-100">{palioGameLabels[group.game]}</h3>
                          <span className="text-sm font-semibold text-amber-200/70">
                            {group.results.length}/{contrade.length}
                          </span>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {group.results.map((result) => {
                            const contrada = contrade.find((item) => item.id === result.contrada_id);
                            const stemma = getContradaStemma(contrada?.name);

                            return (
                              <div
                                key={`${result.game}-${result.contrada_id}`}
                                className="grid grid-cols-[minmax(0,1fr)_72px_82px] items-center gap-2 rounded-md bg-black/20 bg-cover bg-center px-2 py-1.5"
                                style={
                                  stemma
                                    ? { backgroundImage: `linear-gradient(90deg, rgba(10,6,4,.82), rgba(10,6,4,.55) 55%, rgba(10,6,4,.82)), url(${stemma})` }
                                    : undefined
                                }
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-base font-black text-amber-50">{contrada?.name ?? 'Contrada'}</div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-200/55">{getResultPositionLabel(result)}</div>
                                </div>
                                <div className="text-right text-lg font-black text-amber-300">{formatNumber(result.points)}</div>
                                <div className="truncate text-right text-sm font-semibold text-amber-100/75">{getResultValue(result)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {gameResultsGroups.length === 0 && (
                      <div className="flex min-h-0 items-center justify-center rounded-md border border-amber-200/20 bg-black/20 text-center text-amber-100/70">
                        Nessun risultato prova ancora visibile.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!tripliceWinner && (activeSection === 'partial' || activeSection === 'total') && (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <h2 className="text-2xl font-black text-amber-100 sm:text-4xl">
                      {activeSection === 'partial' ? 'Classifica parziale' : 'Classifica finale'}
                    </h2>
                    <Medal className="h-9 w-9 text-amber-300" />
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <div className="grid h-full grid-cols-1 gap-1.5 xl:grid-cols-2">
                      {ranking.slice(0, 12).map((item) => {
                        const stemma = getContradaStemma(item.name);

                        return (
                        <div key={item.id} className="grid min-h-0 grid-cols-[44px_minmax(0,1fr)_88px] items-center rounded-md border border-amber-200/20 bg-amber-50/10 px-2 py-1.5 sm:grid-cols-[52px_minmax(0,1fr)_104px]">
                          <div className="text-2xl font-black text-amber-300">{item.rank}</div>
                          <div className="flex min-w-0 items-center gap-2">
                            {stemma && (
                              <img src={stemma} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-amber-200/30" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-lg font-black text-amber-50 sm:text-xl">{item.name}</div>
                              <div className="text-xs text-amber-100/60">
                                {item.completedGames}/{expectedGames.length} prove completate
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-2xl font-black text-amber-100">
                            {item.totalPoints.toLocaleString('it-IT')}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

        </main>
      </div>
    </div>
  );
}
