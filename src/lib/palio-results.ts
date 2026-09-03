import type { PalioEdition, PalioGame } from '../hooks/usePalioLiveData';
import { getPalioGamesForMonth } from '../hooks/usePalioLiveData';

// Porting delle funzioni pure di calcolo/validazione risultati da
// fantapalio/src/pages/Admin.tsx (handleSavePalioResults e dintorni),
// senza la funzionalità di "correzione manuale del calcolo" (riservata
// agli amministratori pieni nell'Admin del Fanta) e senza la gestione
// batterie/no-players (resta nell'Admin del Fanta).

export interface PalioEditionResultInput {
  contrada_id: string;
  adjusted_time_seconds: string;
  final_bonus_points: string;
  is_disqualified: boolean;
  melocotogno_2_count: string;
  melocotogno_5_count: string;
  melocotogno_10_count: string;
  notes: string;
  penalty_count: string;
  position: string;
  points: string;
  time_seconds: string;
}

export interface PalioCalculatedResultRow extends PalioEditionResultInput {
  total: number | null;
}

export type PalioInputStatus = 'complete' | 'invalid' | 'missing' | 'notApplicable';

export const palioGameLabels: Record<PalioGame, string> = {
  carriola: 'Corsa con le carriole',
  cerchio: 'Corsa col cerchio',
  corsa: 'Corsa',
  finale: 'Tenzone finale',
  melocotogno: 'Melocotogno',
  torre: 'Costruzione della torre',
};

export const palioGameDescriptions: Record<PalioGame, string> = {
  carriola: 'Tempo valido solo senza penalità',
  cerchio: 'Tempo più penalità convertite in secondi',
  corsa: 'Tempo più penalità convertite in secondi',
  finale: 'Prova a tempo tra le tre contrade finaliste',
  melocotogno: 'Somma fettucce da 2, 5 e 10 punti',
  torre: 'Tempo più penalità convertite in secondi',
};

export const getAvailablePalioGamesForMonth = (month: PalioEdition['month']): PalioGame[] =>
  month === 'ottobre'
    ? [...getPalioGamesForMonth(month), 'finale']
    : getPalioGamesForMonth(month);

export const getPalioEditionOrder = (edition: Pick<PalioEdition, 'year' | 'month'>): number =>
  edition.year * 2 + (edition.month === 'ottobre' ? 1 : 0);

export const getNextPalioEdition = (edition: Pick<PalioEdition, 'year' | 'month'>): Pick<PalioEdition, 'year' | 'month'> =>
  edition.month === 'maggio'
    ? { year: edition.year, month: 'ottobre' }
    : { year: edition.year + 1, month: 'maggio' };

export const formatPalioEditionLabel = (edition: Pick<PalioEdition, 'year' | 'month'>): string =>
  `${edition.month} ${edition.year}`;

export const getStablePalioRandomOrder = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1000003;
  }
  return hash;
};

export const parsePalioInteger = (value: string): number | null => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

export const parsePalioNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatPalioNumberInput = (value: number | string | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

const rankPalioValues = (
  items: { contrada_id: string; value: number | null }[],
  direction: 'asc' | 'desc',
  fallbackRank = 12
): Map<string, number | null> => {
  const validValues = items
    .map((item) => item.value)
    .filter((value): value is number => value !== null && !Number.isNaN(value) && value < 999);
  const ranks = new Map<string, number | null>();

  items.forEach((item) => {
    if (item.value === null || Number.isNaN(item.value)) {
      ranks.set(item.contrada_id, null);
      return;
    }

    if (item.value >= 999) {
      ranks.set(item.contrada_id, fallbackRank);
      return;
    }

    const betterValues = validValues.filter((value) =>
      direction === 'asc' ? value < item.value! : value > item.value!
    );
    ranks.set(item.contrada_id, betterValues.length + 1);
  });

  return ranks;
};

export function calculatePalioRows(
  rows: PalioEditionResultInput[],
  game: PalioGame,
  noPlayerContradaIds: Set<string> = new Set()
): PalioCalculatedResultRow[] {
  const effectiveRows = rows.map((row) => (
    noPlayerContradaIds.has(row.contrada_id)
      ? {
        ...row,
        is_disqualified: true,
        melocotogno_2_count: '',
        melocotogno_5_count: '',
        melocotogno_10_count: '',
        penalty_count: '999',
        time_seconds: ''
      }
      : row
  ));

  if (game === 'melocotogno') {
    const totals = effectiveRows.map((row) => {
      const hasInput =
        row.melocotogno_2_count.trim() !== '' ||
        row.melocotogno_5_count.trim() !== '' ||
        row.melocotogno_10_count.trim() !== '';
      const count2 = parsePalioInteger(row.melocotogno_2_count) ?? 0;
      const count5 = parsePalioInteger(row.melocotogno_5_count) ?? 0;
      const count10 = parsePalioInteger(row.melocotogno_10_count) ?? 0;

      return {
        contrada_id: row.contrada_id,
        value: noPlayerContradaIds.has(row.contrada_id) ? 999 : hasInput ? count2 * 2 + count5 * 5 + count10 * 10 : null
      };
    });
    const ranks = rankPalioValues(totals, 'desc');

    return effectiveRows.map((row) => {
      const position = ranks.get(row.contrada_id) ?? null;
      const points = position === null ? null : 13 - position;
      const total = totals.find((item) => item.contrada_id === row.contrada_id)?.value ?? null;

      return {
        ...row,
        adjusted_time_seconds: '',
        final_bonus_points: '',
        position: position === null ? '' : String(position),
        points: points === null ? '' : String(points),
        total
      };
    });
  }

  if (game === 'finale') {
    const adjustedTimes = effectiveRows.map((row) => {
      const timeSeconds = parsePalioNumber(row.time_seconds);
      const penaltyCount = parsePalioInteger(row.penalty_count) ?? 0;
      const adjustedTime = row.is_disqualified || penaltyCount >= 999 || timeSeconds === null
        ? row.is_disqualified || penaltyCount >= 999 ? 999 : null
        : timeSeconds + penaltyCount * 3;

      return { contrada_id: row.contrada_id, value: adjustedTime };
    });
    const ranks = rankPalioValues(adjustedTimes, 'asc', 3);

    return effectiveRows.map((row) => {
      const adjustedTime = adjustedTimes.find((item) => item.contrada_id === row.contrada_id)?.value ?? null;
      const position = ranks.get(row.contrada_id) ?? null;

      return {
        ...row,
        adjusted_time_seconds: adjustedTime === null || adjustedTime >= 999 ? '' : String(Number(adjustedTime.toFixed(2))),
        final_bonus_points: '',
        position: position === null ? '' : String(position),
        points: '',
        total: adjustedTime
      };
    });
  }

  const adjustedTimes = effectiveRows.map((row) => {
    const timeSeconds = parsePalioNumber(row.time_seconds);
    const penaltyCount = parsePalioInteger(row.penalty_count) ?? 0;
    const isCarriolaPenalty = game === 'carriola' && penaltyCount > 0;
    const adjustedTime = row.is_disqualified || penaltyCount >= 999 || isCarriolaPenalty || timeSeconds === null
      ? row.is_disqualified || penaltyCount >= 999 || isCarriolaPenalty ? 999 : null
      : timeSeconds + penaltyCount * 3;

    return { contrada_id: row.contrada_id, value: adjustedTime };
  });
  const ranks = rankPalioValues(adjustedTimes, 'asc');

  return effectiveRows.map((row) => {
    const adjustedTime = adjustedTimes.find((item) => item.contrada_id === row.contrada_id)?.value ?? null;
    const position = ranks.get(row.contrada_id) ?? null;
    const points = position === null ? null : 13 - position;

    return {
      ...row,
      adjusted_time_seconds: adjustedTime === null || adjustedTime >= 999 ? '' : String(Number(adjustedTime.toFixed(2))),
      final_bonus_points: '',
      position: position === null ? '' : String(position),
      points: points === null ? '' : String(points),
      total: adjustedTime
    };
  });
}

export function validatePalioRows(
  rows: PalioCalculatedResultRow[],
  game: PalioGame,
  noPlayerContradaIds: Set<string>
): {
  completeCount: number;
  invalidCount: number;
  missingCount: number;
  statusByContradaId: Map<string, PalioInputStatus>;
} {
  const statusByContradaId = new Map<string, PalioInputStatus>();
  let completeCount = 0;
  let invalidCount = 0;
  let missingCount = 0;

  rows.forEach((row) => {
    const isNoPlayer = noPlayerContradaIds.has(row.contrada_id);
    let status: PalioInputStatus;

    if (isNoPlayer || row.is_disqualified) {
      status = 'notApplicable';
    } else if (game === 'melocotogno') {
      const values = [row.melocotogno_2_count, row.melocotogno_5_count, row.melocotogno_10_count];
      const hasInput = values.some((value) => value.trim() !== '');
      const hasInvalidValue = values.some((value) => value.trim() !== '' && (parsePalioInteger(value) === null || parsePalioInteger(value)! < 0));
      status = hasInvalidValue ? 'invalid' : hasInput ? 'complete' : 'missing';
    } else {
      const timeSeconds = parsePalioNumber(row.time_seconds);
      const penalties = parsePalioInteger(row.penalty_count);
      const hasInvalidTime = row.time_seconds.trim() !== '' && (timeSeconds === null || timeSeconds < 0);
      const hasInvalidPenalties = row.penalty_count.trim() !== '' && (penalties === null || penalties < 0);
      status = hasInvalidTime || hasInvalidPenalties ? 'invalid' : timeSeconds === null ? 'missing' : 'complete';
    }

    statusByContradaId.set(row.contrada_id, status);
    if (status === 'complete' || status === 'notApplicable') completeCount += 1;
    if (status === 'invalid') invalidCount += 1;
    if (status === 'missing') missingCount += 1;
  });

  return { completeCount, invalidCount, missingCount, statusByContradaId };
}
