import { Flag, Sparkles, Trophy } from 'lucide-react';
import sforzindaLogo from '../assets/sforzinda-logo-inverted.png';
import { getContradaStemma } from '../lib/contrada-stemmi';
import { useAuspiciData } from '../hooks/useAuspiciData';
import { auspiciProvaLabels, auspiciProvaOrder, getAuspiciPoints } from '../lib/auspici-results';

// Vista pubblica della classifica della Cena degli Auspici. Competizione
// autonoma e non ufficiale (Regolamento, punto 1): niente Punti Palio, niente
// interferenza con le estrazioni/risultati ufficiali mostrati da <PalioLive />.
// I partecipanti possono includere squadre extra non ufficiali valide solo
// per questo evento, oltre alle 12 Contrade: lo stemma viene mostrato solo
// quando il nome corrisponde a una Contrada ufficiale.

export function AuspiciClassifica() {
  const { carte, edition, loading, participants, ranking } = useAuspiciData('auspici-classifica-page');
  const totalParticipants = participants.length;

  return (
    <div className="min-h-screen bg-[#180f0a] text-amber-50">
      <div className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,#7a2f18_0,#2a140c_34%,#120b08_72%)]">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(90deg,rgba(255,244,194,.12)_1px,transparent_1px),linear-gradient(rgba(255,244,194,.12)_1px,transparent_1px)] [background-size:42px_42px]" />

        <header className="relative z-10 flex items-center justify-between gap-3 border-b border-amber-200/20 px-4 py-3 sm:px-6">
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

        <main className="relative z-10 space-y-4 p-3 pb-10 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-amber-200/20 bg-black/20 py-16">
              <p className="text-base font-semibold text-amber-100">Caricamento classifica...</p>
            </div>
          ) : !edition ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200/20 bg-black/20 py-16 text-center">
              <Sparkles aria-hidden="true" className="h-10 w-10 text-amber-300" />
              <h2 className="mt-3 text-2xl font-black text-amber-100">Classifica non ancora pubblicata</h2>
              <p className="mt-1.5 px-6 text-sm text-amber-100/70">
                La classifica della Cena degli Auspici sarà visibile quando la regia pubblicherà l&rsquo;edizione.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-amber-200/25 bg-black/20 p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/60">
                  <Trophy aria-hidden="true" className="h-4 w-4" />
                  Classifica generale — Punti Auspicio
                </div>
                <div className="space-y-1.5">
                  {ranking.map((item) => (
                    <div
                      className="grid grid-cols-[32px_36px_minmax(0,1fr)_64px] items-center gap-2 rounded-lg bg-amber-50/10 px-3 py-2 sm:grid-cols-[40px_44px_minmax(0,1fr)_80px]"
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

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {auspiciProvaOrder.map((prova) => {
                  const provaRanking = ranking
                    .map((item) => ({ item, result: item.provaResults[prova] }))
                    .filter((entry) => entry.result?.position !== null && entry.result?.position !== undefined)
                    .sort((a, b) => (a.result!.position! - b.result!.position!));

                  if (provaRanking.length === 0) return null;

                  return (
                    <div className="rounded-xl border border-amber-200/20 bg-black/20 p-3" key={prova}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/60">
                        {auspiciProvaLabels[prova]}
                      </h3>
                      <div className="space-y-1">
                        {provaRanking.map(({ item, result }) => (
                          <div
                            className="flex items-center justify-between gap-2 rounded bg-amber-50/5 px-2 py-1 text-sm"
                            key={item.id}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="font-bold text-amber-300">{result!.position}°</span>
                              <span className="truncate text-amber-50">{item.name}</span>
                            </span>
                            <span className="shrink-0 font-semibold text-amber-200/80">
                              {getAuspiciPoints(result!.position, totalParticipants)?.toLocaleString('it-IT')} pt
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              {carte.length > 0 && (
                <section className="rounded-xl border border-amber-200/20 bg-black/20 p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/60">
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
