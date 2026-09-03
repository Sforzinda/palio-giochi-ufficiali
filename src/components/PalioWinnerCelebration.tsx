import { useLayoutEffect, useRef, useState } from 'react';
import { Award, Crown, Flag, Sparkles, Trophy } from 'lucide-react';
import { getResultValue, type PalioEditionResult, type RankingItem } from '../hooks/usePalioLiveData';

interface PalioWinnerCelebrationProps {
  result: PalioEditionResult | null;
  variant?: 'desktop' | 'mobile';
  winner: RankingItem;
}

const confettiPieces = Array.from({ length: 22 }, (_, index) => index);
const pennants = Array.from({ length: 11 }, (_, index) => index);

export function PalioWinnerCelebration({ result, variant = 'desktop', winner }: PalioWinnerCelebrationProps) {
  const isMobile = variant === 'mobile';
  const titleFrameRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [titleFontSize, setTitleFontSize] = useState(isMobile ? 42 : 92);

  useLayoutEffect(() => {
    const frame = titleFrameRef.current;
    const title = titleRef.current;

    if (!frame || !title) return;

    const updateFontSize = () => {
      const availableWidth = frame.clientWidth - 8;
      const measuredWidth = title.scrollWidth;

      if (!availableWidth || !measuredWidth) {
        setTitleFontSize(isMobile ? 42 : 92);
        return;
      }

      const currentFontSize = Number.parseFloat(window.getComputedStyle(title).fontSize) || (isMobile ? 42 : 92);
      const baseFontSize = isMobile ? 42 : 92;
      const minFontSize = isMobile ? 30 : 58;
      const nextFontSize = Math.min(
        baseFontSize,
        Math.max(minFontSize, currentFontSize * (availableWidth / measuredWidth))
      );

      setTitleFontSize((current) => (Math.abs(current - nextFontSize) > 0.5 ? nextFontSize : current));
    };

    updateFontSize();

    const rafId = window.requestAnimationFrame(updateFontSize);
    const observer = new ResizeObserver(updateFontSize);
    observer.observe(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [isMobile, winner.name]);

  const statGridClass = isMobile ? 'grid-cols-2' : 'grid-cols-3';
  const stageHeightClass = isMobile
    ? 'h-[min(560px,calc(100dvh-7.25rem))]'
    : 'h-[min(calc(100dvh-10rem),760px)]';

  return (
    <section className={`fp-palio-winner-stage relative overflow-hidden border border-amber-200/40 bg-[#180f0a] text-center shadow-2xl shadow-yellow-950/40 ${
      isMobile ? `rounded-xl px-3 py-3 ${stageHeightClass}` : `mb-3 flex min-h-0 rounded-md p-4 ${stageHeightClass}`
    }`}>
      <div className="fp-palio-winner-spotlight pointer-events-none absolute inset-0" />
      <div className="fp-palio-winner-rim pointer-events-none absolute inset-[10px] rounded-[inherit]" />
      <div className="fp-palio-winner-radiance pointer-events-none absolute inset-0" />
      <div className="fp-palio-winner-tapestry pointer-events-none absolute inset-0" />
      <div className="fp-palio-winner-curtain fp-palio-winner-curtain-left pointer-events-none absolute bottom-0 left-0 top-0" />
      <div className="fp-palio-winner-curtain fp-palio-winner-curtain-right pointer-events-none absolute bottom-0 right-0 top-0" />
      <div className="fp-palio-winner-drape pointer-events-none absolute inset-x-0 top-0 h-24" />
      <div className="fp-palio-winner-drape-line pointer-events-none absolute left-1/2 top-12 h-px w-[min(58rem,84vw)] -translate-x-1/2" />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between sm:inset-x-8 sm:top-5">
        {pennants.map((item) => (
          <span
            key={item}
            className="fp-palio-winner-pennant block h-8 w-5 bg-amber-200/70 shadow-sm shadow-amber-950/30 sm:h-11 sm:w-7"
            style={{ animationDelay: `${item * 90}ms` }}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0">
        {confettiPieces.map((item) => (
          <span
            key={item}
            className="fp-palio-winner-confetto absolute block h-2 w-5 rounded-sm"
            style={{
              animationDelay: `${(item % 9) * 170}ms`,
              backgroundColor: item % 3 === 0 ? 'rgba(251, 191, 36, .88)' : item % 3 === 1 ? 'rgba(254, 243, 199, .78)' : 'rgba(180, 83, 9, .82)',
              left: `${6 + ((item * 37) % 88)}%`,
              top: `${4 + ((item * 19) % 78)}%`
            }}
          />
        ))}
      </div>

      <div className={`relative z-10 ${isMobile ? 'mx-auto flex h-full min-h-0 max-w-md flex-col items-center justify-center px-1' : 'm-auto grid h-full min-h-0 w-full max-w-6xl grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-6 lg:gap-8'}`}>
        <div className={`fp-palio-winner-side-panel ${isMobile ? 'hidden' : 'flex'}`}>
          <div className="fp-palio-winner-side-badge">
            <Award className="h-7 w-7 text-amber-200" />
          </div>
          <div className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-amber-200/70">
            Contrada
            <br />
            vincitrice
          </div>
          <p className="mt-4 max-w-[18ch] text-sm font-semibold leading-6 text-amber-100/80">
            La fascia del Palio passa alla contrada che ha chiuso davanti a tutte.
          </p>
        </div>

        <div className="relative flex min-w-0 flex-col items-center justify-center px-1">
          <div className="fp-palio-winner-seal mx-auto flex items-center justify-center rounded-full border border-amber-200/60 bg-amber-100/15 shadow-xl shadow-amber-950/40">
            <Trophy className={`${isMobile ? 'h-10 w-10' : 'h-14 w-14'} text-amber-200`} />
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-amber-200/80 sm:text-sm">
            <Flag className="h-4 w-4" />
            Vincitore del Palio
            <Flag className="h-4 w-4" />
          </div>

          <div ref={titleFrameRef} className="fp-palio-winner-name-frame relative mt-4 w-full max-w-4xl overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
            <div className="fp-palio-winner-name-backdrop pointer-events-none absolute inset-0" />
            <div className="relative">
              <h2
                ref={titleRef}
                className="fp-palio-winner-title mx-auto inline-block whitespace-nowrap font-black leading-[0.9] text-amber-50"
                style={{ fontSize: `${titleFontSize}px` }}
              >
                {winner.name}
              </h2>
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/65 sm:text-[11px]">
                <Sparkles className="h-3.5 w-3.5" />
                drappo assegnato
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-5 h-px w-full max-w-2xl bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />

          <p className={`mx-auto mt-5 max-w-3xl font-semibold text-amber-100/90 ${isMobile ? 'text-sm leading-6' : 'text-2xl sm:text-3xl'}`}>
            La Triplice Tenzone è conclusa. Il drappo passa alla contrada vincitrice.
          </p>

          <div className={`mt-6 grid w-full gap-2.5 ${statGridClass}`}>
            <div className="fp-palio-winner-stat rounded-md border border-amber-200/35 bg-black/25 px-4 py-3 sm:px-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/60 sm:text-xs">Tempo finale</div>
              <div className="mt-1 text-xl font-black text-amber-100 sm:text-2xl">{result ? getResultValue(result) : '-'}</div>
            </div>
            <div className="fp-palio-winner-stat rounded-md border border-amber-200/35 bg-black/25 px-4 py-3 sm:px-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/60 sm:text-xs">Tenzone</div>
              <div className="mt-1 flex items-center justify-center gap-2 text-xl font-black text-amber-100 sm:text-2xl">
                <Crown className="h-5 w-5 text-amber-200 sm:h-6 sm:w-6" />
                1° posto
              </div>
            </div>
            <div className="fp-palio-winner-stat rounded-md border border-amber-200/35 bg-black/25 px-4 py-3 sm:px-5 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/60 sm:text-xs">Classifica pre-finale</div>
              <div className="mt-1 text-xl font-black text-amber-100 sm:text-2xl">{winner.totalPoints.toLocaleString('it-IT')} pt</div>
            </div>
          </div>
        </div>

        <div className={`fp-palio-winner-side-panel ${isMobile ? 'hidden' : 'flex'}`}>
          <div className="fp-palio-winner-side-badge">
            <Crown className="h-7 w-7 text-amber-200" />
          </div>
          <div className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-amber-200/70">
            Classifica
            <br />
            pre-finale
          </div>
          <p className="mt-4 max-w-[18ch] text-sm font-semibold leading-6 text-amber-100/80">
            Il punteggio che portava la contrada al momento della finale resta in evidenza.
          </p>
        </div>
      </div>
    </section>
  );
}
