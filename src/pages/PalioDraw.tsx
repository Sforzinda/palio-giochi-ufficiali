import { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { Flag, Gem } from 'lucide-react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';
import {
  type Contrada,
  type PalioGame,
  getPalioGamesForMonth,
  palioGameLabels,
  usePalioLiveData
} from '../hooks/usePalioLiveData';
import sforzindaLogo from '../assets/sforzinda-logo-inverted.png';
import { getContradaStemma } from '../lib/contrada-stemmi';

// Nota: a differenza della versione originale in fantapalio, questo componente
// non renderizza un proprio tag SEO (react-helmet-async): è responsabilità
// della pagina consumatrice avvolgerlo con la propria gestione di <head>.

interface DrawStep {
  contrada: Contrada | null;
  displayOrder: number;
  game: PalioGame;
  heatNumber: number;
  isUnavailable: boolean;
  stepKey: string;
}

interface DrawGameGroup {
  endIndex: number;
  game: PalioGame;
  startIndex: number;
  steps: DrawStep[];
}

const gamePalette: Record<PalioGame, { accent: string; deep: string; glow: string; paper: string }> = {
  carriola: {
    accent: '#bef264',
    deep: '#26320f',
    glow: 'rgba(190, 242, 100, 0.42)',
    paper: '#f1f7d0'
  },
  cerchio: {
    accent: '#67e8f9',
    deep: '#0e2f36',
    glow: 'rgba(103, 232, 249, 0.38)',
    paper: '#def7f5'
  },
  corsa: {
    accent: '#fb923c',
    deep: '#3b1608',
    glow: 'rgba(251, 146, 60, 0.42)',
    paper: '#f8e4c8'
  },
  finale: {
    accent: '#fde68a',
    deep: '#342408',
    glow: 'rgba(253, 230, 138, 0.42)',
    paper: '#f8edc8'
  },
  melocotogno: {
    accent: '#f9a8d4',
    deep: '#3d1028',
    glow: 'rgba(249, 168, 212, 0.4)',
    paper: '#f8dceb'
  },
  torre: {
    accent: '#d6d3d1',
    deep: '#292524',
    glow: 'rgba(214, 211, 209, 0.36)',
    paper: '#eee9df'
  }
};

function getOrderedGames(editionGameOrder: PalioGame[], heatGames: PalioGame[]) {
  const expectedGames = editionGameOrder.filter((game) => heatGames.includes(game));
  const extraGames = heatGames
    .filter((game) => !expectedGames.includes(game))
    .sort((firstGame, secondGame) => palioGameLabels[firstGame].localeCompare(palioGameLabels[secondGame], 'it'));

  return [...expectedGames, ...extraGames];
}

function buildDrawGameGroups(drawSteps: DrawStep[]): DrawGameGroup[] {
  const games = Array.from(new Set(drawSteps.map((step) => step.game)));

  return games.reduce<DrawGameGroup[]>((groups, game) => {
    const steps = drawSteps.filter((step) => step.game === game);
    const startIndex = groups[groups.length - 1]?.endIndex ?? 0;

    return [
      ...groups,
      {
        endIndex: startIndex + steps.length,
        game,
        startIndex,
        steps
      }
    ];
  }, []);
}

function getActiveDrawGroup(groups: DrawGameGroup[], visibleCount: number): DrawGameGroup | null {
  if (groups.length === 0) return null;
  if (visibleCount <= 0) return groups[0];

  return groups.find((group) => visibleCount > group.startIndex && visibleCount <= group.endIndex) ?? groups[groups.length - 1];
}

function getProgrammaGridSize(stepCount: number) {
  const columns = stepCount > 18 ? 4 : stepCount > 12 ? 3 : stepCount > 6 ? 2 : 1;
  const rows = Math.max(Math.ceil(stepCount / columns), 1);

  return { columns, rows };
}

function groupStepsByHeat(steps: DrawStep[]) {
  return Array.from(new Set(steps.map((step) => step.heatNumber)))
    .map((heatNumber) => ({
      heatNumber,
      items: steps
        .filter((step) => step.heatNumber === heatNumber)
        .sort((firstStep, secondStep) => firstStep.displayOrder - secondStep.displayOrder)
    }));
}

function PalioGameSummary({
  group,
  isTotalPending = false,
  liveTitle
}: {
  group: DrawGameGroup;
  isTotalPending?: boolean;
  liveTitle: string;
}) {
  const palette = gamePalette[group.game];
  const heatGroups = groupStepsByHeat(group.steps);

  return (
    <section className="relative flex min-h-[72vh] flex-col overflow-hidden rounded-[2rem] border border-amber-100/28 bg-black/30 p-5 shadow-2xl shadow-black/40 lg:col-span-2 lg:min-h-0 lg:p-8">
      <div
        className="absolute inset-0 opacity-95"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${palette.glow}, transparent 34%), linear-gradient(135deg, ${palette.deep}, #160b06 62%, #090604)`
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(90deg,rgba(255,237,213,.16)_1px,transparent_1px),linear-gradient(rgba(255,237,213,.12)_1px,transparent_1px)] [background-size:46px_46px]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.32em] text-amber-100/62">
              Riepilogo batterie
            </div>
            <h2 className="mt-2 text-5xl font-black leading-none tracking-[-0.05em] text-amber-50 sm:text-7xl">
              {palioGameLabels[group.game]}
            </h2>
            <p className="mt-4 max-w-3xl text-lg font-semibold text-amber-100/72">
              {liveTitle} · tutte le contrade del gioco sono state estratte.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-100/28 bg-amber-50/10 px-5 py-4 text-right">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/56">Contrade</div>
            <div className="mt-1 text-4xl font-black text-amber-50">{group.steps.length}</div>
          </div>
        </div>

        <div className="mt-8 flex-1">
          <div
            className="grid h-full gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(heatGroups.length, 1)}, minmax(0, 1fr))` }}
          >
            {heatGroups.map((heatGroup) => (
              <div
                key={heatGroup.heatNumber}
                className="flex flex-col rounded-[1.5rem] border border-amber-100/24 bg-[#f6ead2] p-3 text-[#2a1309] shadow-2xl shadow-black/30"
              >
                <div className="border-b border-[#2a1309]/12 pb-2">
                  <div className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-[#92400e]">Batteria</div>
                  <h3 className="mt-1 text-2xl font-black leading-none">{heatGroup.heatNumber}</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {heatGroup.items.map((step) => {
                    const stemma = getContradaStemma(step.contrada?.name);

                    return (
                    <div key={step.stepKey} className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-xl bg-[#2a1309]/8 px-2 py-1.5">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2a1309] text-sm font-black text-amber-100">
                        {step.displayOrder}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {stemma && (
                            <img src={stemma} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-[#2a1309]/20" />
                          )}
                          <div className="truncate text-sm font-black leading-tight">{step.contrada?.name ?? 'Contrada'}</div>
                        </div>
                        {step.isUnavailable && (
                          <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-red-700">N.A.</div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isTotalPending && (
          <div className="mt-6 rounded-2xl border border-amber-100/24 bg-amber-50/10 px-5 py-4 text-center text-sm font-black uppercase tracking-[0.24em] text-amber-100/68">
            Ultimo gioco completato: tra 20 secondi compare il riepilogo totale.
          </div>
        )}
      </div>
    </section>
  );
}

function PalioTotalSummary({
  groups,
  liveTitle
}: {
  groups: DrawGameGroup[];
  liveTitle: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setIsPaused(false);
  }, [groups]);

  useEffect(() => {
    if (groups.length <= 1 || isPaused) return;

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % groups.length);
    }, 5600);

    return () => window.clearInterval(timer);
  }, [groups, isPaused]);

  const activeGroup = groups[activeIndex] ?? null;
  const heatGroups = activeGroup ? groupStepsByHeat(activeGroup.steps) : [];

  return (
    <section className="relative flex min-h-[72vh] flex-col overflow-hidden rounded-[2rem] border border-amber-100/30 bg-black/30 p-5 shadow-2xl shadow-black/40 lg:col-span-2 lg:min-h-0 lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(254,215,170,.34),transparent_30%),linear-gradient(135deg,#3b1608,#160b06_58%,#090604)]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(90deg,rgba(255,237,213,.16)_1px,transparent_1px),linear-gradient(rgba(255,237,213,.12)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.34em] text-amber-100/62">Riepilogo totale</div>
            <h2 className="mt-2 text-4xl font-black leading-none tracking-[-0.05em] text-amber-50 sm:text-6xl">
              Tutte le batterie
            </h2>
            <p className="mt-4 max-w-3xl text-lg font-semibold text-amber-100/72">
              {liveTitle} · le batterie scorrono una alla volta, senza scroll.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <img src={sforzindaLogo} alt="Sforzinda" className="h-14 w-14 object-contain" />
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-amber-100/20 bg-black/24 px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-amber-100/72">
                {activeIndex + 1}/{groups.length || 1}
              </div>
              {groups.length > 1 && (
                <button
                  aria-pressed={isPaused}
                  className="rounded-full border border-amber-100/24 bg-black/24 px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-amber-100/72 transition hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                  onClick={() => setIsPaused((currentlyPaused) => !currentlyPaused)}
                  type="button"
                >
                  {isPaused ? 'Riprendi' : 'Pausa'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div aria-label="Giochi del riepilogo" className="mt-5 flex flex-wrap gap-2" role="tablist">
          {groups.map((group, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                aria-selected={isActive}
                className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 ${
                  isActive
                    ? 'border-amber-100/60 bg-amber-100/18 text-amber-50'
                    : 'border-amber-100/14 bg-black/16 text-amber-100/54'
                }`}
                key={group.game}
                onClick={() => {
                  setActiveIndex(index);
                  setIsPaused(true);
                }}
                role="tab"
                type="button"
              >
                {palioGameLabels[group.game]}
              </button>
            );
          })}
        </div>

        <div aria-live="polite" className="sr-only">
          {activeGroup
            ? `${palioGameLabels[activeGroup.game]}: ${activeGroup.steps.length} contrade estratte`
            : ''}
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          {activeGroup ? (
            <div
              key={activeGroup.game}
              className="flex min-h-0 w-full flex-1 flex-col rounded-[1.5rem] border border-amber-100/24 bg-amber-50/10 p-4 shadow-2xl shadow-black/24 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.26em] text-amber-100/56">Vista sequenziale</div>
                  <h3 className="mt-1 text-3xl font-black text-amber-50 sm:text-4xl">{palioGameLabels[activeGroup.game]}</h3>
                </div>
                <div className="rounded-2xl border border-amber-100/18 bg-black/24 px-4 py-3 text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/52">Contrade</div>
                  <div className="mt-1 text-3xl font-black text-amber-50">{activeGroup.steps.length}</div>
                </div>
              </div>

              <div className="mt-4 flex-1">
                <div
                  className="grid h-full gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.max(heatGroups.length, 1)}, minmax(0, 1fr))` }}
                >
                  {heatGroups.map((heatGroup) => (
                    <div key={heatGroup.heatNumber} className="flex flex-col rounded-2xl border border-amber-100/16 bg-black/24 p-2">
                      <div className="border-b border-amber-100/10 pb-1.5">
                        <div className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/52">
                          Batteria {heatGroup.heatNumber}
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-1 flex-col gap-1">
                        {heatGroup.items.map((step) => {
                          const stemma = getContradaStemma(step.contrada?.name);

                          return (
                          <div
                            key={step.stepKey}
                            className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg bg-amber-50/8 bg-cover bg-center px-2"
                            style={
                              stemma
                                ? { backgroundImage: `linear-gradient(90deg, rgba(9,6,4,.82), rgba(9,6,4,.4)), url(${stemma})` }
                                : undefined
                            }
                          >
                            <span className="shrink-0 text-base font-black text-amber-200 sm:text-lg">{step.displayOrder}</span>
                            <span className="min-w-0 truncate text-lg font-black leading-tight text-amber-50 sm:text-xl lg:text-2xl">
                              {step.contrada?.name ?? 'Contrada'}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full rounded-[1.5rem] border border-amber-100/18 bg-black/24 p-6 text-center text-amber-100">
              Nessuna batteria disponibile.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PalioDrawComposition({
  liveTitle,
  nextLabel,
  progress,
  showSummary,
  step,
  summarySteps,
  totalCount,
  visibleCount
}: {
  liveTitle: string;
  nextLabel: string;
  progress: number;
  showSummary: boolean;
  step: DrawStep | null;
  summarySteps: DrawStep[];
  totalCount: number;
  visibleCount: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const summaryGame = summarySteps[0]?.game ?? null;
  const palette = step ? gamePalette[step.game] : summaryGame ? gamePalette[summaryGame] : gamePalette.finale;
  const reveal = spring({
    config: {
      damping: 16,
      mass: 0.82,
      stiffness: 96
    },
    fps,
    frame: Math.max(frame - 10, 0)
  });
  const curtain = interpolate(frame, [0, 34], [0, -48], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const cardScale = interpolate(reveal, [0, 1], [0.72, 1]);
  const cardRotate = interpolate(reveal, [0, 1], [-8, 0]);
  const titleOpacity = interpolate(frame, [12, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const nameOpacity = interpolate(frame, [28, 48], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const sweep = interpolate(frame % 120, [0, 120], [-40, 140]);
  const contradaName = step?.contrada?.name ?? 'Sigillo chiuso';
  const contradaStemma = getContradaStemma(step?.contrada?.name);
  const summaryGroups = Array.from(new Set(summarySteps.map((summaryStep) => summaryStep.heatNumber)))
    .map((heatNumber) => ({
      heatNumber,
      items: summarySteps.filter((summaryStep) => summaryStep.heatNumber === heatNumber)
    }));

  return (
    <AbsoluteFill
      style={{
        background:
          `radial-gradient(circle at 50% 8%, ${palette.glow}, transparent 34%), linear-gradient(135deg, #160b06 0%, ${palette.deep} 52%, #090604 100%)`,
        color: '#fff7ed',
        fontFamily: 'Georgia, "Times New Roman", serif',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(255, 237, 213, 0.13) 1px, transparent 1px), linear-gradient(rgba(255, 237, 213, 0.1) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          inset: 0,
          maskImage: 'radial-gradient(circle at center, black 0%, transparent 78%)',
          opacity: 0.38,
          position: 'absolute'
        }}
      />
      {Array.from({ length: 18 }).map((_, index) => {
        const x = (index * 137) % 100;
        const y = (index * 61) % 100;
        const drift = interpolate((frame + index * 9) % 90, [0, 45, 90], [0, -18, 0]);

        return (
          <div
            key={index}
            style={{
              background: index % 3 === 0 ? palette.accent : '#fed7aa',
              borderRadius: 999,
              boxShadow: `0 0 34px ${palette.glow}`,
              height: index % 4 === 0 ? 12 : 7,
              left: `${x}%`,
              opacity: 0.18 + (index % 5) * 0.08,
              position: 'absolute',
              top: `calc(${y}% + ${drift}px)`,
              width: index % 4 === 0 ? 12 : 7
            }}
          />
        );
      })}
      <div
        style={{
          background: `linear-gradient(100deg, transparent 0%, ${palette.glow} 45%, transparent 70%)`,
          filter: 'blur(18px)',
          height: '130%',
          left: `${sweep}%`,
          opacity: 0.52,
          position: 'absolute',
          top: '-15%',
          transform: 'rotate(12deg)',
          width: '20%'
        }}
      />
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 32,
          justifyContent: 'space-between',
          left: 72,
          position: 'absolute',
          right: 72,
          top: 52
        }}
      >
        <div>
          <div
            style={{
              color: '#fed7aa',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 8,
              opacity: 0.78,
              textTransform: 'uppercase'
            }}
          >
            Estrazioni batterie
          </div>
          <div
            style={{
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: -2,
              lineHeight: 1.02,
              marginTop: 8,
              maxWidth: 1120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {liveTitle}
          </div>
        </div>
        <div
          style={{
            border: '1px solid rgba(254, 215, 170, 0.28)',
            borderRadius: 999,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 900,
            padding: '18px 28px'
          }}
        >
          {visibleCount}/{totalCount}
        </div>
      </div>
      <div
        style={{
          bottom: '13%',
          left: '50%',
          opacity: titleOpacity,
          position: 'absolute',
          textAlign: 'center',
          transform: `translateX(-50%) translateY(${curtain}px)`,
          width: '86%'
        }}
      >
        <div
          style={{
            color: palette.accent,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 950,
            letterSpacing: 10,
            textTransform: 'uppercase'
          }}
        >
          {showSummary && summaryGame
            ? `Riepilogo ${palioGameLabels[summaryGame]}`
            : step
              ? `${palioGameLabels[step.game]} · Batteria ${step.heatNumber}`
              : 'Pronti al sorteggio'}
        </div>
      </div>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          inset: '18% 8% 16%',
          justifyContent: 'center',
          position: 'absolute'
        }}
      >
        <div
          style={{
            background: `linear-gradient(145deg, ${palette.paper}, #fff7ed 58%, #e7c99a)`,
            border: '4px solid rgba(255, 247, 237, 0.72)',
            borderRadius: 58,
            boxShadow: `0 52px 130px rgba(0, 0, 0, 0.5), 0 0 90px ${palette.glow}`,
            color: palette.deep,
            minHeight: 440,
            overflow: 'hidden',
            padding: 64,
            position: 'relative',
            transform: `scale(${cardScale}) rotate(${cardRotate}deg)`,
            width: 1180
          }}
        >
          <div
            style={{
              border: `30px solid ${palette.accent}`,
              borderRadius: '50%',
              height: 250,
              opacity: 0.18,
              position: 'absolute',
              right: -72,
              top: -76,
              width: 250
            }}
          />
          <div
            style={{
              background: palette.accent,
              borderRadius: '50%',
              bottom: -110,
              height: 310,
              left: 78,
              opacity: 0.16,
              position: 'absolute',
              width: 310
            }}
          />
          <div style={{ position: 'relative' }}>
            {showSummary ? (
              <>
                <div
                  style={{
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                    fontSize: 28,
                    fontWeight: 950,
                    letterSpacing: 9,
                    opacity: nameOpacity,
                    textTransform: 'uppercase'
                  }}
                >
                  Batterie completate
                </div>
                <div
                  style={{
                    display: 'grid',
                    gap: 22,
                    gridTemplateColumns: `repeat(${Math.min(summaryGroups.length, 4)}, minmax(0, 1fr))`,
                    marginTop: 34,
                    opacity: nameOpacity
                  }}
                >
                  {summaryGroups.map((group) => (
                    <div
                      key={group.heatNumber}
                      style={{
                        background: 'rgba(42, 19, 9, 0.08)',
                        border: '2px solid rgba(42, 19, 9, 0.14)',
                        borderRadius: 28,
                        padding: 24
                      }}
                    >
                      <div
                        style={{
                          color: '#92400e',
                          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                          fontSize: 22,
                          fontWeight: 950,
                          letterSpacing: 5,
                          marginBottom: 18,
                          textTransform: 'uppercase'
                        }}
                      >
                        Batteria {group.heatNumber}
                      </div>
                      {group.items.map((summaryStep) => {
                        const summaryStemma = getContradaStemma(summaryStep.contrada?.name);

                        return (
                        <div
                          key={summaryStep.stepKey}
                          style={{
                            alignItems: 'center',
                            display: 'grid',
                            gap: 12,
                            gridTemplateColumns: summaryStemma ? '42px 34px minmax(0, 1fr)' : '42px minmax(0, 1fr)',
                            marginTop: 12
                          }}
                        >
                          <div
                            style={{
                              background: palette.deep,
                              borderRadius: 999,
                              color: '#fff7ed',
                              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                              fontSize: 20,
                              fontWeight: 950,
                              height: 42,
                              lineHeight: '42px',
                              textAlign: 'center'
                            }}
                          >
                            {summaryStep.displayOrder}
                          </div>
                          {summaryStemma && (
                            <img
                              src={summaryStemma}
                              alt=""
                              style={{ borderRadius: '50%', height: 34, objectFit: 'cover', width: 34 }}
                            />
                          )}
                          <div
                            style={{
                              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                              fontSize: 27,
                              fontWeight: 950,
                              lineHeight: 1.05,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {summaryStep.contrada?.name ?? 'Contrada'}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 54
                  }}
                >
                  <span
                    style={{
                      background: palette.deep,
                      borderRadius: 999,
                      color: '#fff7ed',
                      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                      fontSize: 24,
                      fontWeight: 950,
                      letterSpacing: 4,
                      padding: '18px 30px',
                      textTransform: 'uppercase'
                    }}
                  >
                    Posizione {step?.displayOrder ?? '-'}
                  </span>
                  {step?.isUnavailable && (
                    <span
                      style={{
                        background: '#b91c1c',
                        borderRadius: 999,
                        color: '#ffffff',
                        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                        fontSize: 24,
                        fontWeight: 950,
                        letterSpacing: 4,
                        padding: '18px 30px',
                        textTransform: 'uppercase'
                      }}
                    >
                      N.A.
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: '#92400e',
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                    fontSize: 30,
                    fontWeight: 950,
                    letterSpacing: 11,
                    opacity: nameOpacity,
                    textTransform: 'uppercase'
                  }}
                >
                  Contrada estratta
                </div>
                {contradaStemma && (
                  <img
                    src={contradaStemma}
                    alt=""
                    style={{
                      borderRadius: '50%',
                      boxShadow: '0 0 0 6px rgba(42, 19, 9, 0.14)',
                      height: 148,
                      marginTop: 24,
                      objectFit: 'cover',
                      opacity: nameOpacity,
                      width: 148
                    }}
                  />
                )}
                <div
                  style={{
                    fontSize: contradaName.length > 12 ? 132 : 168,
                    fontWeight: 950,
                    letterSpacing: -9,
                    lineHeight: 0.9,
                    marginTop: 24,
                    opacity: nameOpacity,
                    textTransform: 'uppercase'
                  }}
                >
                  {contradaName}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255, 247, 237, 0.12)',
          borderRadius: 999,
          bottom: 58,
          height: 16,
          left: 86,
          overflow: 'hidden',
          position: 'absolute',
          right: 86
        }}
      >
        <div
          style={{
            background: `linear-gradient(90deg, ${palette.accent}, #fed7aa)`,
            borderRadius: 999,
            height: '100%',
            width: `${progress}%`
          }}
        />
      </div>
      <div
        style={{
          bottom: 84,
          color: '#fed7aa',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: 2,
          opacity: 0.72,
          position: 'absolute',
          right: 86,
          textTransform: 'uppercase'
        }}
      >
        Prossima: {nextLabel}
      </div>
    </AbsoluteFill>
  );
}

export function PalioDraw() {
  const {
    contrade,
    control,
    edition,
    heats,
    liveTitle,
    loading
  } = usePalioLiveData('palio-draw-page');

  const drawSteps = useMemo<DrawStep[]>(() => {
    if (!edition) return [];

    const contradeById = new Map(contrade.map((contrada) => [contrada.id, contrada]));
    const drawableHeats = heats.filter((heat) => heat.game !== 'melocotogno' && heat.game !== 'finale');
    const heatGames = Array.from(new Set(drawableHeats.map((heat) => heat.game)));
    const orderedGames = getOrderedGames(getPalioGamesForMonth(edition.month), heatGames);

    return orderedGames.flatMap((game) => {
      const gameHeats = drawableHeats
        .filter((heat) => heat.game === game)
        .sort((firstHeat, secondHeat) => {
          if (firstHeat.heat_number !== secondHeat.heat_number) {
            return firstHeat.heat_number - secondHeat.heat_number;
          }

          return firstHeat.display_order - secondHeat.display_order;
        });

      return gameHeats.map((heat) => ({
        contrada: contradeById.get(heat.contrada_id) ?? null,
        displayOrder: heat.display_order,
        game: heat.game,
        heatNumber: heat.heat_number,
        isUnavailable: heat.no_players,
        stepKey: `${heat.game}-${heat.heat_number}-${heat.display_order}-${heat.contrada_id}`
      }));
    });
  }, [contrade, edition, heats]);

  const drawGameGroups = useMemo(() => buildDrawGameGroups(drawSteps), [drawSteps]);
  const revealedCount = Math.max(control?.draw_revealed_count ?? 0, 0);
  const visibleCount = Math.min(revealedCount, drawSteps.length);
  const activeGroup = getActiveDrawGroup(drawGameGroups, visibleCount);
  const activeGroupVisibleCount = activeGroup
    ? Math.min(Math.max(visibleCount - activeGroup.startIndex, 0), activeGroup.steps.length)
    : 0;
  const groupIsComplete = !!activeGroup && activeGroupVisibleCount >= activeGroup.steps.length;
  const { columns: programmaColumns, rows: programmaRows } = getProgrammaGridSize(activeGroup?.steps.length ?? 0);
  const activeStep = visibleCount > 0 ? drawSteps[visibleCount - 1] ?? null : null;
  const [showGameSummary, setShowGameSummary] = useState(false);
  const displayedStep = showGameSummary && groupIsComplete ? null : activeStep;
  const activeGameLabel = activeGroup ? palioGameLabels[activeGroup.game] : null;
  const nextStep = drawSteps[visibleCount] ?? null;
  const progress = drawSteps.length > 0 ? (visibleCount / drawSteps.length) * 100 : 0;
  const isActive = !loading && control && edition && drawSteps.length > 0;
  const lastGroup = drawGameGroups[drawGameGroups.length - 1] ?? null;
  const lastGameIsComplete = !!lastGroup && groupIsComplete && activeGroup?.game === lastGroup.game && visibleCount >= drawSteps.length;
  const [showTotalSummary, setShowTotalSummary] = useState(false);

  useEffect(() => {
    setShowGameSummary(false);
    setShowTotalSummary(false);

    if (!groupIsComplete) return;

    const timer = window.setTimeout(() => {
      setShowGameSummary(true);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [activeGroup?.game, groupIsComplete, visibleCount]);

  useEffect(() => {
    setShowTotalSummary(false);

    if (!lastGameIsComplete || !showGameSummary) return;

    const timer = window.setTimeout(() => {
      setShowTotalSummary(true);
    }, 20000);

    return () => window.clearTimeout(timer);
  }, [lastGameIsComplete, showGameSummary, visibleCount]);

  return (
    <div className="min-h-screen bg-[#160b06] text-stone-50 lg:h-screen lg:overflow-hidden">
      <div className="fp-draw-stage relative min-h-screen px-4 py-5 sm:px-6 lg:flex lg:h-full lg:flex-col lg:overflow-hidden lg:px-8">
        <div className="pointer-events-none absolute inset-0 fp-draw-veil" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-amber-200/16 to-transparent" />
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl fp-draw-orb-one" />
        <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-lime-300/12 blur-3xl fp-draw-orb-two" />

        <header className="relative z-10 flex w-full items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.32em] text-amber-100/70">
              <Flag className="h-4 w-4" />
              Estrazioni batterie
            </div>
            <h1 className="mt-2 truncate text-3xl font-black leading-none text-amber-50 sm:text-5xl lg:text-6xl xl:text-7xl">
              {liveTitle}
            </h1>
          </div>
        </header>

        <main className="relative z-10 mt-6 grid w-full gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(400px,0.9fr)] lg:grid-rows-[minmax(0,1fr)]">
          {loading ? (
            <section className="flex min-h-[72vh] items-center justify-center rounded-[2rem] border border-amber-100/20 bg-black/28 text-xl font-black text-amber-100">
              Caricamento estrazioni...
            </section>
          ) : !isActive ? (
            <section className="flex min-h-[72vh] flex-col items-center justify-center rounded-[2rem] border border-amber-100/20 bg-black/28 p-8 text-center">
              <Gem className="h-14 w-14 text-amber-200" />
              <h2 className="mt-5 text-4xl font-black text-amber-50">Estrazioni non attive</h2>
              <p className="mt-3 max-w-xl text-lg font-medium text-amber-50/68">
                La schermata si popolerà quando sarà attiva un&apos;edizione con batterie configurate.
              </p>
            </section>
          ) : showTotalSummary ? (
            <PalioTotalSummary
              groups={drawGameGroups}
              liveTitle={liveTitle}
            />
          ) : showGameSummary && groupIsComplete && activeGroup ? (
            <PalioGameSummary
              group={activeGroup}
              isTotalPending={lastGameIsComplete}
              liveTitle={liveTitle}
            />
          ) : (
            <>
              <section className="relative min-h-[72vh] overflow-hidden rounded-[2rem] border border-amber-100/24 bg-black/30 p-5 shadow-2xl shadow-black/40 sm:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_10%,rgba(255,240,180,.24),transparent_34%),radial-gradient(circle_at_18%_88%,rgba(249,115,22,.22),transparent_28%)]" />
                <div className="pointer-events-none absolute inset-x-8 top-8 flex justify-between opacity-70">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <span
                      className="h-2 w-9 rounded-full bg-amber-100/65 fp-draw-light"
                      key={index}
                      style={{ animationDelay: `${index * 120}ms` }}
                    />
                  ))}
                </div>

                <div aria-live="polite" className="sr-only">
                  {activeStep
                    ? `${activeStep.contrada?.name ?? 'Contrada'} estratta, ${palioGameLabels[activeStep.game]}, batteria ${activeStep.heatNumber}`
                    : ''}
                </div>

                <div className="relative z-10 flex min-h-[calc(72vh-4rem)] flex-col justify-between">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-black uppercase tracking-[0.26em] text-amber-100/62">
                        {showGameSummary && groupIsComplete && activeGameLabel
                          ? `Riepilogo ${activeGameLabel}`
                          : displayedStep
                            ? palioGameLabels[displayedStep.game]
                            : activeGameLabel ?? 'Pronti al sorteggio'}
                      </div>
                      <div className="mt-2 text-3xl font-black text-amber-50 sm:text-5xl">
                        {showGameSummary && groupIsComplete
                          ? 'Batterie completate'
                          : displayedStep
                            ? `Batteria ${displayedStep.heatNumber}`
                            : 'Inizio estrazioni'}
                      </div>
                      {activeStep && (
                        <div className="mt-4 inline-flex max-w-full flex-col rounded-2xl border border-amber-100/25 bg-amber-50/10 px-4 py-3 shadow-xl shadow-black/20">
                          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-100/55">
                            Ultima contrada estratta
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-2">
                            {getContradaStemma(activeStep.contrada?.name) && (
                              <img
                                src={getContradaStemma(activeStep.contrada?.name)}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-amber-100/40"
                              />
                            )}
                            <span className="truncate text-3xl font-black leading-none text-amber-50 sm:text-4xl">
                              {activeStep.contrada?.name ?? 'Contrada'}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-amber-100/24 bg-amber-50/10 px-4 py-3 text-right">
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-100/55">Avanzamento</div>
                      <div className="mt-1 text-3xl font-black text-amber-50">{visibleCount}/{drawSteps.length}</div>
                    </div>
                  </div>

                  <div className="grid flex-1 place-items-center py-6">
                    <div className="relative w-full overflow-hidden rounded-[2rem] border border-amber-100/35 bg-black/35 shadow-[0_30px_90px_rgba(0,0,0,.5)]">
                      <Player
                        key={`${groupIsComplete ? `summary-${activeGroup?.game}` : displayedStep?.stepKey ?? 'sealed'}-${visibleCount}`}
                        autoPlay
                        clickToPlay={false}
                        component={PalioDrawComposition}
                        compositionHeight={1080}
                        compositionWidth={1920}
                        controls={false}
                        durationInFrames={150}
                        fps={30}
                        inputProps={{
                          liveTitle,
                          nextLabel: nextStep ? `${palioGameLabels[nextStep.game]}, batteria ${nextStep.heatNumber}` : 'riepilogo finale',
                          progress,
                          showSummary: false,
                          step: displayedStep,
                          summarySteps: activeGroup?.steps ?? [],
                          totalCount: drawSteps.length,
                          visibleCount
                        }}
                        loop={false}
                        style={{
                          aspectRatio: '16 / 9',
                          display: 'block',
                          width: '100%'
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-100/14 pt-4 text-sm font-bold text-amber-50/68">
                    <div>
                      Prossima: {nextStep ? `${palioGameLabels[nextStep.game]}, batteria ${nextStep.heatNumber}` : 'riepilogo finale'}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="grid content-start gap-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
                <section className="rounded-[1.5rem] border border-amber-100/20 bg-black/26 p-3 shadow-xl shadow-black/20 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.24em] text-amber-100/55">Programma</div>
                      <h2 className="mt-1 text-3xl font-black text-amber-50">
                        {activeGameLabel ? `${activeGameLabel} in ordine` : 'Batterie in ordine'}
                      </h2>
                      <p className="mt-1 text-base font-semibold text-amber-100/58">
                        {activeGroupVisibleCount}/{activeGroup?.steps.length ?? 0} contrade inviate
                      </p>
                    </div>
                    <img src={sforzindaLogo} alt="Sforzinda" className="h-11 w-11 object-contain" />
                  </div>
                  <div
                    className="mt-3 grid gap-2 lg:min-h-0 lg:flex-1"
                    style={{
                      gridAutoFlow: 'column',
                      gridTemplateColumns: `repeat(${programmaColumns}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${programmaRows}, minmax(0, 1fr))`
                    }}
                  >
                    {(activeGroup?.steps ?? []).map((step, index) => {
                      const globalIndex = (activeGroup?.startIndex ?? 0) + index;
                      const isRevealed = globalIndex < visibleCount;
                      const isCurrent = !groupIsComplete && globalIndex === visibleCount - 1;
                      const stemma = isRevealed ? getContradaStemma(step.contrada?.name) : undefined;

                      return (
                        <div
                          className={`grid min-h-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-xl border px-2.5 py-1.5 transition duration-500 ${
                            isCurrent
                              ? 'border-amber-100/60 bg-amber-100/20 text-amber-50'
                              : isRevealed
                                ? 'border-amber-100/16 bg-amber-50/10 text-amber-50/88'
                                : 'border-amber-100/10 bg-black/20 text-amber-50/64'
                          }`}
                          key={step.stepKey}
                        >
                          <span className="text-sm font-black text-amber-200">{step.displayOrder}</span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {stemma && (
                              <img src={stemma} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-amber-100/30" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black leading-tight">
                                {isRevealed ? step.contrada?.name ?? 'Contrada' : 'Sigillo chiuso'}
                              </span>
                              <span className="block truncate text-[9px] font-bold uppercase tracking-[0.12em] text-amber-100/50">
                                Batteria {step.heatNumber} · {isRevealed ? 'Estratta' : 'Attesa'}
                              </span>
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </aside>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
