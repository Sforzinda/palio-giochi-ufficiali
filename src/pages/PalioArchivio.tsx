import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { getContradaStemma } from '../lib/contrada-stemmi';
import { usePalioArchiveData } from '../hooks/usePalioArchiveData';
import {
  formatEditionLabel,
  formatNumber,
  getResultPositionLabel,
  getResultValue,
  palioGameLabels,
} from '../hooks/usePalioLiveData';

// Vista pubblica delle edizioni precedenti: mostra solo quelle che la
// Gestione ha reso visibili (palio_editions.archive_visible).

export function PalioArchivio() {
  const { archive, contrade, error, loading } = usePalioArchiveData();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const contradaName = (id: string) => contrade.find((contrada) => contrada.id === id)?.name ?? 'Contrada';

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-stone-100">
      <header className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-palio-300">
          <History className="h-4 w-4" />
          Archivio
        </div>
        <h1 className="mt-2 font-medieval text-4xl font-bold">Edizioni precedenti</h1>
        <p className="mt-2 text-stone-400">Classifiche e risultati dei singoli giochi delle passate edizioni del Palio.</p>
      </header>

      {loading ? (
        <p className="py-16 text-center text-stone-400">Caricamento archivio...</p>
      ) : error ? (
        <p className="py-16 text-center text-stone-400">Non è stato possibile caricare l&apos;archivio. Riprova più tardi.</p>
      ) : archive.length === 0 ? (
        <p className="py-16 text-center text-stone-400">Nessuna edizione disponibile in archivio.</p>
      ) : (
        <div className="space-y-4">
          {archive.map(({ edition, games, ranking }) => {
            const isOpen = openIds.has(edition.id);
            const winner = ranking[0]?.totalPoints > 0 ? ranking[0] : null;

            return (
              <section key={edition.id} className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900">
                <button
                  type="button"
                  onClick={() => toggle(edition.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-stone-800/60"
                >
                  <div>
                    <h2 className="text-xl font-bold">{formatEditionLabel(edition)}</h2>
                    {winner && <p className="text-sm text-stone-400">Prima classificata: {winner.name}</p>}
                  </div>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-stone-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="space-y-6 border-t border-stone-800 px-4 py-4">
                    {games.length === 0 ? (
                      <p className="text-sm text-stone-400">Nessun risultato registrato per questa edizione.</p>
                    ) : (
                      <>
                        <div>
                          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-palio-300">Classifica generale</h3>
                          <ul className="space-y-1">
                            {ranking.map((item) => {
                              const stemma = getContradaStemma(item.name);
                              return (
                                <li key={item.id} className="grid grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-md bg-stone-800/60 px-3 py-1.5">
                                  <span className="font-black text-palio-300">{item.rank}</span>
                                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                                    {stemma && <img src={stemma} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />}
                                    <span className="truncate">{item.name}</span>
                                  </span>
                                  <span className="text-right font-black">{item.totalPoints.toLocaleString('it-IT')}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        {games.map(({ game, results }) => (
                          <div key={game}>
                            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-palio-300">{palioGameLabels[game]}</h3>
                            <ul className="space-y-1">
                              {results.map((result) => {
                                const name = contradaName(result.contrada_id);
                                const stemma = getContradaStemma(name);
                                return (
                                  <li key={result.contrada_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-stone-800/60 px-3 py-1.5 sm:grid-cols-[6rem_minmax(0,1fr)_7rem_3rem]">
                                    <span className="hidden text-sm text-stone-400 sm:block">{getResultPositionLabel(result)}</span>
                                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                                      {stemma && <img src={stemma} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />}
                                      <span className="truncate">{name}</span>
                                    </span>
                                    <span className="hidden text-right text-sm text-stone-300 sm:block">{getResultValue(result)}</span>
                                    <span className="text-right font-black">
                                      {game === 'finale' ? '' : `${formatNumber(result.points)} pt`}
                                      {game === 'finale' && <span className="text-sm font-semibold text-stone-300">{result.position ? `${result.position}°` : ''}</span>}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
