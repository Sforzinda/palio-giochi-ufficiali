import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Flag, Sparkles, Trophy } from 'lucide-react';
import sforzindaLogo from '../assets/sforzinda-logo-inverted.png';
import { getContradaStemma } from '../lib/contrada-stemmi';
import { useAuspiciData } from '../hooks/useAuspiciData';
import type { AuspiciProva } from '../hooks/useAuspiciData';
import { auspiciProvaLabels, auspiciProvaOrder, getAuspiciPoints } from '../lib/auspici-results';

// Vista pubblica della classifica della Cena degli Auspici. Competizione
// autonoma e non ufficiale (Regolamento, punto 1): niente Punti Palio, niente
// interferenza con le estrazioni/risultati ufficiali mostrati da <PalioLive />.
// I partecipanti possono includere squadre extra non ufficiali valide solo
// per questo evento, oltre alle 12 Contrade: lo stemma viene mostrato solo
// quando il nome corrisponde a una Contrada ufficiale.
//
// Pensata per uno schermo/proiettore in sala: le classifiche (generale +
// una per ogni prova conclusa + carte assegnate) ruotano automaticamente
// una alla volta, invece di stare tutte assieme in un'unica schermata.
// useFitScale misura l'altezza/larghezza naturali della pagina corrente e le
// confronta con lo spazio disponibile sotto l'header, scalando il contenuto
// (in entrambe le direzioni, anche ingrandendo) finché non riempie al meglio
// lo schermo senza richiedere scroll.

const ROTATION_INTERVAL_MS = 8000;

function useFitScale<Content extends HTMLElement, Container extends HTMLElement>(dependency: unknown) {
  const containerRef = useRef<Container | null>(null);
  const contentRef = useRef<Content | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    function recompute() {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const contentWidth = content.scrollWidth;
      const contentHeight = content.scrollHeight;
      if (contentWidth === 0 || contentHeight === 0) return;

      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;
      // Margine di sicurezza per evitare tagli dovuti ad arrotondamenti subpixel.
      const nextScale = 0.98 * Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    }

    recompute();
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(container);
    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependency]);

  return { containerRef, contentRef, scale };
}

type ClassificaPage = { type: 'ranking' } | { type: 'carte' } | { prova: AuspiciProva; type: 'prova' };

export function AuspiciClassifica() {
  const { carte, edition, loading, participants, pinnedPage, ranking } = useAuspiciData('auspici-classifica-page');
  const totalParticipants = participants.length;

  const pages = useMemo<ClassificaPage[]>(() => {
    const result: ClassificaPage[] = [];
    if (ranking.length > 0) result.push({ type: 'ranking' });
    for (const prova of auspiciProvaOrder) {
      const hasResults = ranking.some(
        (item) => item.provaResults[prova]?.position !== null && item.provaResults[prova]?.position !== undefined
      );
      if (hasResults) result.push({ prova, type: 'prova' });
    }
    if (carte.length > 0) result.push({ type: 'carte' });
    return result;
  }, [carte, ranking]);

  // Se la regia ha fissato una pagina (auspici_live_controls.pinned_page),
  // quella resta mostrata staticamente e la rotazione si ferma.
  const pinnedClassificaPage = useMemo<ClassificaPage | null>(() => {
    if (!pinnedPage) return null;
    if (pinnedPage === 'ranking') return { type: 'ranking' };
    if (pinnedPage === 'carte') return { type: 'carte' };
    return { prova: pinnedPage, type: 'prova' };
  }, [pinnedPage]);

  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [edition?.id]);

  useEffect(() => {
    if (pinnedClassificaPage || pages.length <= 1) return;
    const interval = setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pages.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pages.length, pinnedClassificaPage]);

  const currentPage = pinnedClassificaPage ?? (pages.length > 0 ? pages[pageIndex % pages.length] : null);
  const { containerRef, contentRef, scale } = useFitScale<HTMLDivElement, HTMLDivElement>(currentPage);

  return (
    <div className="h-screen overflow-hidden bg-[#180f0a] text-amber-50">
      <div className="relative flex h-full flex-col bg-[radial-gradient(circle_at_top_left,#7a2f18_0,#2a140c_34%,#120b08_72%)]">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(90deg,rgba(255,244,194,.12)_1px,transparent_1px),linear-gradient(rgba(255,244,194,.12)_1px,transparent_1px)] [background-size:42px_42px]" />

        <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/20 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/70 sm:text-xs">
              <Flag aria-hidden="true" className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
              Cena degli Auspici — competizione non ufficiale
            </div>
            <h1 className="truncate text-xl font-black text-amber-100 sm:text-3xl">
              {edition ? `${edition.title} ${edition.year}` : 'Cena degli Auspici'}
            </h1>
          </div>
          <img alt="Sforzinda" className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" src={sforzindaLogo} />
        </header>

        <main className="relative z-10 min-h-0 flex-1 p-3 sm:p-6" ref={containerRef}>
          {loading ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-amber-200/20 bg-black/20">
              <p className="text-base font-semibold text-amber-100">Caricamento classifica...</p>
            </div>
          ) : !edition ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-amber-200/20 bg-black/20 text-center">
              <Sparkles aria-hidden="true" className="h-10 w-10 text-amber-300" />
              <h2 className="mt-3 text-2xl font-black text-amber-100">Classifica non ancora pubblicata</h2>
              <p className="mt-1.5 px-6 text-sm text-amber-100/70">
                La classifica della Cena degli Auspici sarà visibile quando la regia pubblicherà l&rsquo;edizione.
              </p>
            </div>
          ) : !currentPage ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-amber-200/20 bg-black/20 text-center">
              <Sparkles aria-hidden="true" className="h-10 w-10 text-amber-300" />
              <h2 className="mt-3 text-2xl font-black text-amber-100">Nessun risultato ancora disponibile</h2>
            </div>
          ) : (
            <div
              className="mx-auto w-fit origin-top"
              ref={contentRef}
              style={{ transform: `scale(${scale})` }}
            >
              {currentPage.type === 'ranking' && (
                <section className="w-[min(94vw,980px)] rounded-xl border border-amber-200/25 bg-black/20 p-3 sm:p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/60">
                    <Trophy aria-hidden="true" className="h-4 w-4" />
                    Classifica generale — Punti Auspicio
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {ranking.map((item) => (
                      <div
                        className="grid grid-cols-[28px_32px_minmax(0,1fr)_56px] items-center gap-1.5 rounded-lg bg-amber-50/10 px-2 py-1.5 sm:grid-cols-[36px_40px_minmax(0,1fr)_72px] sm:gap-2 sm:px-3 sm:py-2"
                        key={item.id}
                      >
                        <span className="text-lg font-black text-amber-300 sm:text-xl">{item.rank}°</span>
                        {getContradaStemma(item.name) ? (
                          <img
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full object-cover sm:h-9 sm:w-9"
                            src={getContradaStemma(item.name)}
                          />
                        ) : (
                          <span className="h-7 w-7 shrink-0 sm:h-9 sm:w-9" />
                        )}
                        <span className="truncate text-sm font-bold text-amber-50 sm:text-base">{item.name}</span>
                        <span className="text-right text-sm font-black text-amber-200 sm:text-base">
                          {item.totalPoints.toLocaleString('it-IT')} pt
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {currentPage.type === 'prova' && (() => {
                const prova = currentPage.prova;
                const provaRanking = ranking
                  .map((item) => ({ item, result: item.provaResults[prova] }))
                  .filter((entry) => entry.result?.position !== null && entry.result?.position !== undefined)
                  .sort((a, b) => (a.result!.position! - b.result!.position!));

                return (
                  <section className="w-[min(94vw,980px)] rounded-xl border border-amber-200/20 bg-black/20 p-3 sm:p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/60">
                      <Trophy aria-hidden="true" className="h-4 w-4" />
                      {auspiciProvaLabels[prova]}
                    </h3>
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      {provaRanking.map(({ item, result }) => (
                        <div
                          className="grid grid-cols-[28px_32px_minmax(0,1fr)_56px] items-center gap-1.5 rounded-lg bg-amber-50/10 px-2 py-1.5 sm:grid-cols-[36px_40px_minmax(0,1fr)_72px] sm:gap-2 sm:px-3 sm:py-2"
                          key={item.id}
                        >
                          <span className="text-lg font-black text-amber-300 sm:text-xl">{result!.position}°</span>
                          {getContradaStemma(item.name) ? (
                            <img
                              alt=""
                              className="h-7 w-7 shrink-0 rounded-full object-cover sm:h-9 sm:w-9"
                              src={getContradaStemma(item.name)}
                            />
                          ) : (
                            <span className="h-7 w-7 shrink-0 sm:h-9 sm:w-9" />
                          )}
                          <span className="truncate text-sm font-bold text-amber-50 sm:text-base">{item.name}</span>
                          <span className="text-right text-sm font-black text-amber-200 sm:text-base">
                            {getAuspiciPoints(result!.position, totalParticipants)?.toLocaleString('it-IT')} pt
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {currentPage.type === 'carte' && (
                <section className="w-[min(90vw,640px)] rounded-xl border border-amber-200/20 bg-black/20 p-3 sm:p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/60">
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                    Carte Auspicio assegnate
                  </h3>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {carte.map((carta) => {
                      const participantName = ranking.find((item) => item.id === carta.participant_id)?.name ?? '';
                      return (
                        <span
                          className={`rounded-full border px-3 py-1 ${carta.used ? 'border-amber-200/20 text-amber-100/50' : 'border-amber-300/50 text-amber-100'}`}
                          key={`${carta.participant_id}-${carta.carta}`}
                        >
                          {participantName}
                          {carta.used ? ' (usata)' : ''}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>

        {!pinnedClassificaPage && pages.length > 1 && (
          <div className="relative z-10 flex shrink-0 items-center justify-center gap-2 pb-3">
            {pages.map((page, index) => (
              <span
                className={`h-1.5 rounded-full transition-all ${
                  index === pageIndex % pages.length ? 'w-6 bg-amber-300' : 'w-1.5 bg-amber-200/30'
                }`}
                key={page.type === 'prova' ? page.prova : page.type}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
