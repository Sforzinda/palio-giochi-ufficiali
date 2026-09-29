import type { PalioEditionHeat, PalioGame } from '../hooks/usePalioLiveData';

// Logica pura dell'abbinamento dei giudici: nessuna dipendenza da React né da
// Supabase, così si può provare da sola. Il componente PalioGiudici la usa per
// costruire una proposta (anteprima) da confermare prima di salvare.

export type JudgeRole = 'cronometrista' | 'giudice' | 'giudice_campo' | 'giudice_gonna' | 'giudice_fantapalio';
export type JudgePreference = 'cronometrista' | 'giudice';

export interface EngineJudge {
  contrada_ids: string[];
  id: string;
  name: string;
  preferred_role: JudgePreference | null;
}

export interface EngineAssignment {
  game: PalioGame;
  heat_number: number | null;
  is_extra: boolean;
  judge_id: string;
  lane: number | null;
  role: JudgeRole;
}

export interface ProposalRow {
  game: PalioGame;
  heatNumber: number;
  judgeId: string;
  lane: number;
  role: JudgeRole;
}

export interface ProposalExtra {
  game: PalioGame;
  heatNumber: number;
  judgeId: string;
  role: JudgeRole;
}

export interface MissingSlot {
  game: PalioGame;
  heatNumber: number;
  lane: number;
  role: JudgeRole;
}

export interface ProposalInput {
  assignments: EngineAssignment[];
  fixedJudgeIds: Set<string>;
  games: PalioGame[];
  /** true se il giudice della gonna è già stato scelto (una sola persona per edizione). */
  gonnaAlreadySet: boolean;
  heats: PalioEditionHeat[];
  judges: EngineJudge[];
}

// ---------------------------------------------------------------------------
// Struttura dei giochi

// Prove senza batterie (melocotogno, finale): un'unica "batteria" 1.
export function getHeatNumbers(heats: PalioEditionHeat[], game: PalioGame): number[] {
  if (game === 'melocotogno' || game === 'finale') return [1];
  return Array.from(new Set(heats.filter((heat) => heat.game === game).map((heat) => heat.heat_number)))
    .sort((a, b) => a - b);
}

// Corsie di una batteria (display_order delle estrazioni). La finale ha 3
// corsie fisse, il melocotogno un'unica corsia.
export function getLaneNumbers(heats: PalioEditionHeat[], game: PalioGame, heatNumber: number): number[] {
  if (game === 'melocotogno') return [1];
  if (game === 'finale') return [1, 2, 3];
  return Array.from(new Set(
    heats.filter((heat) => heat.game === game && heat.heat_number === heatNumber).map((heat) => heat.display_order)
  )).sort((a, b) => a - b);
}

// Il melocotogno non ha il giudice delle penalità. Giudice di campo e giudice
// della gonna non sono ruoli di corsia (la gonna è una figura fissa del cerchio).
export function getJudgeRoles(game: PalioGame): JudgeRole[] {
  return game === 'melocotogno' ? ['cronometrista'] : ['cronometrista', 'giudice'];
}

export function getLaneContradaId(heats: PalioEditionHeat[], game: PalioGame, heatNumber: number, lane: number): string | null {
  const heat = heats.find((h) => h.game === game && h.heat_number === heatNumber && h.display_order === lane);
  return heat?.contrada_id ?? null;
}

// Un giudice non può stare nella corsia (di quella batteria) dove gareggia una
// delle sue Contrade; nelle altre corsie sì. Nel melocotogno ogni giudice può
// fare il cronometrista e la finale non ha controlli di Contrada.
export function hasLaneConflict(
  heats: PalioEditionHeat[],
  judge: Pick<EngineJudge, 'contrada_ids'>,
  game: PalioGame,
  heatNumber: number,
  lane: number
): boolean {
  if (judge.contrada_ids.length === 0 || game === 'melocotogno' || game === 'finale') return false;
  const contradaId = getLaneContradaId(heats, game, heatNumber, lane);
  return contradaId !== null && judge.contrada_ids.includes(contradaId);
}

// Contrade che gareggiano in una batteria (o in tutto il gioco se heatNumber è null).
export function getParticipantContradaIds(heats: PalioEditionHeat[], game: PalioGame, heatNumber: number | null): Set<string> {
  if (game === 'melocotogno' || game === 'finale') return new Set();
  return new Set(
    heats
      .filter((heat) => heat.game === game && (heatNumber === null || heat.heat_number === heatNumber))
      .map((heat) => heat.contrada_id)
  );
}

// ---------------------------------------------------------------------------
// Preferenze e corsia abituale

/** 0 = preferisce quel ruolo, 1 = indifferente, 2 = preferirebbe l'altro. */
export function preferenceRank(judge: Pick<EngineJudge, 'preferred_role'>, role: JudgeRole): 0 | 1 | 2 {
  const category: JudgePreference = role === 'cronometrista' ? 'cronometrista' : 'giudice';
  if (judge.preferred_role === category) return 0;
  return judge.preferred_role === null ? 1 : 2;
}

/** Il melocotogno non conta per preferenze, equità e carico (un cronometrista accanto al presentatore). */
const countsForFairness = (game: PalioGame) => game !== 'melocotogno';

export interface LaneRecord {
  game: PalioGame;
  heatNumber: number;
  judgeId: string;
  lane: number;
}

/** Corsia abituale di un giudice in un gioco: la più frequente nelle altre batterie (a parità la più bassa). */
export function getUsualLane(records: LaneRecord[], judgeId: string, game: PalioGame, excludeHeat: number | null): number | null {
  const counts = new Map<number, number>();
  records.forEach((record) => {
    if (record.judgeId !== judgeId || record.game !== game || record.heatNumber === excludeHeat) return;
    counts.set(record.lane, (counts.get(record.lane) ?? 0) + 1);
  });
  const [best] = Array.from(counts.entries()).sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  return best ? best[0] : null;
}

// ---------------------------------------------------------------------------
// Assegnazione a costo minimo

export const UNAVAILABLE_COST = 1e7;

// Costi: la preferenza pesa più di tutto, poi l'equità tra giudici, poi la
// corsia e infine il carico. UNAVAILABLE_COST è molto più grande di qualunque
// somma di costi reali: si riempie prima il maggior numero di posti possibile.
const PREFERENCE_COST = 100000;
const FAIRNESS_COST = 20000;
const LANE_COST = 1000;
const LOAD_COST = 10;
const OFF_LANE_OBJECTIVE = 5000;
const MAX_REFINEMENT_PASSES = 6;

// Algoritmo ungherese: posti (righe) contro giudici (colonne).
export function solveAssignment(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const realColumns = cost[0].length;
  const m = Math.max(realColumns, n);
  const at = (i: number, j: number) => (j < realColumns ? cost[i][j] : UNAVAILABLE_COST);
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (used[j]) continue;
        const current = at(i0 - 1, j - 1) - u[i0] - v[j];
        if (current < minv[j]) {
          minv[j] = current;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j += 1) {
    if (p[j] !== 0) result[p[j] - 1] = j - 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Titolari (cronometrista e giudice penalità per corsia)

/**
 * Propone i titolari per tutti i posti vuoti (non tocca gli abbinamenti già
 * fatti) di ogni gioco tranne la finale. Per ogni gioco:
 *  1. prima passata: batteria per batteria, assegnazione a costo minimo tra
 *     posti (corsia x ruolo) e giudici liberi e senza conflitto di Contrada;
 *  2. rifinitura su tutte le batterie insieme: ogni batteria viene ricalcolata
 *     sapendo cosa succede nelle altre (corsia abituale, equità), finché la
 *     soluzione non migliora più.
 * Ordine di priorità: posti coperti, preferenza per il ruolo, equità (chi è già
 * stato assegnato contro la preferenza va evitato), corsia abituale, carico.
 */
export function computeTitolari(input: ProposalInput): { missing: MissingSlot[]; rows: ProposalRow[] } {
  const { assignments, fixedJudgeIds, heats, judges } = input;
  const autoGames = input.games.filter((g) => g !== 'finale');
  const judgeById = new Map(judges.map((judge) => [judge.id, judge]));
  const existingTitolari: LaneRecord[] = [];
  assignments.forEach((a) => {
    if (!a.is_extra && a.lane !== null && a.heat_number !== null) {
      existingTitolari.push({ game: a.game, heatNumber: a.heat_number, judgeId: a.judge_id, lane: a.lane });
    }
  });

  let rows: ProposalRow[] = [];

  const mismatch = (judgeId: string, role: JudgeRole, game: PalioGame) => {
    const judge = judgeById.get(judgeId);
    return judge && countsForFairness(game) && preferenceRank(judge, role) === 2 ? 1 : 0;
  };

  // Metriche di un giudice "fuori" dalla batteria che si sta ricalcolando.
  const loadOf = (judgeId: string, game: PalioGame, heatNumber: number) =>
    assignments.filter((a) => a.judge_id === judgeId && countsForFairness(a.game)).length
    + rows.filter((r) => r.judgeId === judgeId && countsForFairness(r.game) && !(r.game === game && r.heatNumber === heatNumber)).length;
  const mismatchesOf = (judgeId: string, game: PalioGame, heatNumber: number) => {
    let total = 0;
    assignments.forEach((a) => {
      if (a.judge_id === judgeId && !a.is_extra && a.lane !== null) total += mismatch(judgeId, a.role, a.game);
    });
    rows.forEach((r) => {
      if (r.judgeId === judgeId && !(r.game === game && r.heatNumber === heatNumber)) total += mismatch(judgeId, r.role, r.game);
    });
    return total;
  };
  const laneRecords = (): LaneRecord[] => [
    ...existingTitolari,
    ...rows.map((r) => ({ game: r.game, heatNumber: r.heatNumber, judgeId: r.judgeId, lane: r.lane })),
  ];

  const emptySlots = (game: PalioGame, heatNumber: number) =>
    getLaneNumbers(heats, game, heatNumber)
      .flatMap((lane) => getJudgeRoles(game).map((role) => ({ lane, role })))
      .filter(({ lane, role }) => !assignments.some(
        (a) => a.game === game && !a.is_extra && a.heat_number === heatNumber && a.lane === lane && a.role === role
      ));

  const solveHeat = (game: PalioGame, heatNumber: number) => {
    const slots = emptySlots(game, heatNumber);
    rows = rows.filter((r) => !(r.game === game && r.heatNumber === heatNumber));
    if (slots.length === 0 || judges.length === 0) return;
    const taken = new Set(
      assignments.filter((a) => a.game === game && (a.heat_number === heatNumber || a.heat_number === null)).map((a) => a.judge_id)
    );
    const records = laneRecords();
    const cost = slots.map(({ lane, role }) => judges.map((judge, index) => {
      if (taken.has(judge.id) || fixedJudgeIds.has(judge.id) || hasLaneConflict(heats, judge, game, heatNumber, lane)) {
        return UNAVAILABLE_COST;
      }
      const usual = getUsualLane(records, judge.id, game, heatNumber);
      const laneRank = usual === null ? 1 : usual === lane ? 0 : 2;
      const preference = preferenceRank(judge, role);
      const fairness = preference === 2 && countsForFairness(game) ? mismatchesOf(judge.id, game, heatNumber) * FAIRNESS_COST : 0;
      return preference * PREFERENCE_COST + fairness + laneRank * LANE_COST
        + Math.min(loadOf(judge.id, game, heatNumber), 99) * LOAD_COST + index / 1000;
    }));
    const matching = solveAssignment(cost);
    slots.forEach(({ lane, role }, slotIndex) => {
      const judgeIndex = matching[slotIndex];
      if (judgeIndex < 0 || judgeIndex >= judges.length || cost[slotIndex][judgeIndex] >= UNAVAILABLE_COST) return;
      rows.push({ game, heatNumber, judgeId: judges[judgeIndex].id, lane, role });
    });
  };

  // Valore della soluzione di un gioco (più basso = meglio), usato per decidere
  // quando la rifinitura non migliora più.
  const objective = (game: PalioGame, heatNumbers: number[]) => {
    const gameRows = rows.filter((r) => r.game === game);
    const totalSlots = heatNumbers.reduce((sum, h) => sum + emptySlots(game, h).length, 0);
    let value = (totalSlots - gameRows.length) * 1e9;
    const perJudge = new Map<string, ProposalRow[]>();
    gameRows.forEach((r) => perJudge.set(r.judgeId, [...(perJudge.get(r.judgeId) ?? []), r]));
    perJudge.forEach((judgeRows, judgeId) => {
      const judge = judgeById.get(judgeId);
      if (!judge) return;
      const laneCounts = new Map<number, number>();
      [...existingTitolari.filter((e) => e.game === game && e.judgeId === judgeId).map((e) => e.lane), ...judgeRows.map((r) => r.lane)]
        .forEach((lane) => laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1));
      const [modeLane] = Array.from(laneCounts.entries()).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0];
      judgeRows.forEach((r) => {
        value += preferenceRank(judge, r.role) * PREFERENCE_COST * (countsForFairness(game) ? 1 : 0);
        if (r.lane !== modeLane) value += OFF_LANE_OBJECTIVE;
      });
      const mismatches = judgeRows.reduce((sum, r) => sum + mismatch(judgeId, r.role, game), 0);
      value += mismatches * mismatches * FAIRNESS_COST;
    });
    return value;
  };

  autoGames.forEach((game) => {
    const heatNumbers = getHeatNumbers(heats, game);
    heatNumbers.forEach((heatNumber) => solveHeat(game, heatNumber));
    let best = rows.filter((r) => r.game === game);
    let bestValue = objective(game, heatNumbers);
    for (let pass = 0; pass < MAX_REFINEMENT_PASSES; pass += 1) {
      heatNumbers.forEach((heatNumber) => solveHeat(game, heatNumber));
      const value = objective(game, heatNumbers);
      if (value < bestValue) {
        best = rows.filter((r) => r.game === game);
        bestValue = value;
      } else {
        break;
      }
    }
    rows = [...rows.filter((r) => r.game !== game), ...best];
  });

  const missing: MissingSlot[] = [];
  autoGames.forEach((game) => {
    getHeatNumbers(heats, game).forEach((heatNumber) => {
      emptySlots(game, heatNumber).forEach(({ lane, role }) => {
        if (!rows.some((r) => r.game === game && r.heatNumber === heatNumber && r.lane === lane && r.role === role)) {
          missing.push({ game, heatNumber, lane, role });
        }
      });
    });
  });
  return { missing, rows };
}

// ---------------------------------------------------------------------------
// Extra e giudice della gonna

/**
 * I giudici senza lavoro in una batteria diventano extra di quella batteria
 * (esclusi finale, melocotogno, figure fisse e chi ha una Contrada che gareggia
 * in quella batteria). Priorità: un cronometrista extra e un giudice extra per
 * batteria; poi, solo se avanzano giudici liberi in tutto il Cerchio, il
 * giudice della gonna (figura fissa, indipendente dalla Contrada); poi tutti
 * gli altri come extra secondo la preferenza, che resta solo una preferenza.
 */
export function computeExtras(input: ProposalInput, rows: ProposalRow[]): { extras: ProposalExtra[]; gonnaJudgeId: string | null } {
  const { assignments, fixedJudgeIds, heats, judges } = input;
  const extraGames = input.games.filter((g) => g !== 'finale' && g !== 'melocotogno');
  const extras: ProposalExtra[] = [];
  const extraLoad = new Map<string, number>();

  const idleJudgesIn = (game: PalioGame, heatNumber: number) => {
    const busy = new Set([
      ...assignments.filter((a) => a.game === game && (a.heat_number === heatNumber || a.heat_number === null)).map((a) => a.judge_id),
      ...rows.filter((r) => r.game === game && r.heatNumber === heatNumber).map((r) => r.judgeId),
      ...extras.filter((e) => e.game === game && e.heatNumber === heatNumber).map((e) => e.judgeId),
    ]);
    const participants = getParticipantContradaIds(heats, game, heatNumber);
    return judges.filter((judge) =>
      !busy.has(judge.id) && !fixedJudgeIds.has(judge.id) && !judge.contrada_ids.some((id) => participants.has(id)));
  };
  const addExtra = (game: PalioGame, heatNumber: number, judge: EngineJudge, role: JudgeRole) => {
    extraLoad.set(judge.id, (extraLoad.get(judge.id) ?? 0) + 1);
    extras.push({ game, heatNumber, judgeId: judge.id, role });
  };

  extraGames.forEach((game) => {
    getHeatNumbers(heats, game).forEach((heatNumber) => {
      getJudgeRoles(game).forEach((role) => {
        const alreadyThere = assignments.some((a) => a.game === game && a.is_extra && a.heat_number === heatNumber && a.role === role)
          || extras.some((e) => e.game === game && e.heatNumber === heatNumber && e.role === role);
        if (alreadyThere) return;
        const [best] = idleJudgesIn(game, heatNumber)
          .sort((a, b) => preferenceRank(a, role) - preferenceRank(b, role) || (extraLoad.get(a.id) ?? 0) - (extraLoad.get(b.id) ?? 0));
        if (best) addExtra(game, heatNumber, best, role);
      });
    });
  });

  let gonnaJudge: EngineJudge | null = null;
  if (input.games.includes('cerchio') && !input.gonnaAlreadySet) {
    const workedInCerchio = new Set([
      ...assignments.filter((a) => a.game === 'cerchio').map((a) => a.judge_id),
      ...rows.filter((r) => r.game === 'cerchio').map((r) => r.judgeId),
      ...extras.filter((e) => e.game === 'cerchio').map((e) => e.judgeId),
    ]);
    [gonnaJudge = null] = judges
      .filter((judge) => !workedInCerchio.has(judge.id) && !fixedJudgeIds.has(judge.id))
      .sort((a, b) => Number(a.preferred_role !== null) - Number(b.preferred_role !== null));
  }

  extraGames.forEach((game) => {
    const roles = getJudgeRoles(game);
    getHeatNumbers(heats, game).forEach((heatNumber) => {
      const counts = new Map<JudgeRole, number>(roles.map((role) => [
        role,
        assignments.filter((a) => a.game === game && a.is_extra && a.heat_number === heatNumber && a.role === role).length
          + extras.filter((e) => e.game === game && e.heatNumber === heatNumber && e.role === role).length,
      ]));
      idleJudgesIn(game, heatNumber)
        .filter((judge) => judge.id !== gonnaJudge?.id)
        .forEach((judge) => {
          // La preferenza è solo una preferenza: se il ruolo preferito ha già
          // almeno 2 extra in più dell'altro, il giudice va dove ne servono.
          const preferred: JudgeRole = judge.preferred_role === 'giudice' ? 'giudice' : 'cronometrista';
          const other = roles.find((r) => r !== preferred) ?? preferred;
          const keepsPreference = judge.preferred_role !== null && roles.includes(preferred)
            && (counts.get(preferred) ?? 0) - (counts.get(other) ?? 0) < 2;
          const role = keepsPreference
            ? preferred
            : [...roles].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
          counts.set(role, (counts.get(role) ?? 0) + 1);
          addExtra(game, heatNumber, judge, role);
        });
    });
  });

  return { extras, gonnaJudgeId: gonnaJudge?.id ?? null };
}
