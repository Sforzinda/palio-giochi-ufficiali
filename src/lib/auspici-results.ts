import { parsePalioInteger, parsePalioNumber } from './palio-results';
import type { AuspiciProva } from '../hooks/useAuspiciData';

// Funzioni pure di calcolo/validazione per la Serata degli Auspici. A
// differenza dei Giochi del Palio, ogni prova produce una sola metrica
// grezza (raw_score) già riassuntiva — somma piazzamenti, lettere corrette,
// punti bersaglio, punti giudici — calcolata dai giudici secondo il
// Regolamento Cena degli Auspici; qui si applica solo il piazzamento
// (1°-12°, pari merito compreso) e il punteggio 12→1 già usato nei Giochi
// del Palio [regolamento punto 4].

export interface AuspiciResultInput {
  contrada_id: string;
  raw_score: string;
  position: string;
  is_position_overridden: boolean;
  notes: string;
}

export interface AuspiciCalculatedResultRow extends AuspiciResultInput {
  points: number | null;
}

export const auspiciProvaLabels: Record<AuspiciProva, string> = {
  mercante: 'Mercante di Vigevano',
  memoria: 'Memoria Sforzesca',
  investitura: 'Investitura',
  tiro: 'Tiro dell’Auspicio',
  giuramento: 'Giuramento delle Contrade',
};

export const auspiciProvaOrder: AuspiciProva[] = ['mercante', 'memoria', 'investitura', 'tiro', 'giuramento'];

// Direzione della metrica grezza: 'asc' = vince il valore più basso (somma
// piazzamenti/scarti), 'desc' = vince il valore più alto (punti).
export const auspiciProvaDirection: Record<AuspiciProva, 'asc' | 'desc'> = {
  mercante: 'asc',
  memoria: 'desc',
  investitura: 'asc',
  tiro: 'desc',
  giuramento: 'desc',
};

export const auspiciProvaRawScoreLabels: Record<AuspiciProva, string> = {
  mercante: 'Somma dei 5 piazzamenti (vince il più basso)',
  memoria: 'Lettere corrette su 20 (vince il più alto)',
  investitura: 'Somma dei 3 piazzamenti (vince il più basso)',
  tiro: 'Punti bersagli su 15 (vince il più alto)',
  giuramento: 'Punti giudici su 60, penalità già sottratte (vince il più alto)',
};

export const auspiciCartaLabels: Record<'duca' | 'duchessa' | 'armato' | 'fornaio' | 'mastro_falconiere', string> = {
  duca: 'Duca – Vederci chiaro',
  duchessa: 'Duchessa – Voce segreta',
  armato: 'Armato – Protezione',
  fornaio: 'Fornaio – Ritorno in vita',
  mastro_falconiere: 'Mastro Falconiere – Comando',
};

export const getAuspiciPoints = (position: number | null): number | null =>
  position === null ? null : 13 - position;

const rankAuspiciValues = (
  items: { contrada_id: string; value: number | null }[],
  direction: 'asc' | 'desc'
): Map<string, number | null> => {
  const validValues = items
    .map((item) => item.value)
    .filter((value): value is number => value !== null && !Number.isNaN(value));
  const ranks = new Map<string, number | null>();

  items.forEach((item) => {
    if (item.value === null || Number.isNaN(item.value)) {
      ranks.set(item.contrada_id, null);
      return;
    }
    const betterCount = validValues.filter((value) =>
      direction === 'asc' ? value < item.value! : value > item.value!
    ).length;
    ranks.set(item.contrada_id, betterCount + 1);
  });

  return ranks;
};

export function calculateAuspiciRows(rows: AuspiciResultInput[], prova: AuspiciProva): AuspiciCalculatedResultRow[] {
  const direction = auspiciProvaDirection[prova];
  const values = rows.map((row) => ({
    contrada_id: row.contrada_id,
    value: parsePalioNumber(row.raw_score),
  }));
  const ranks = rankAuspiciValues(values, direction);

  return rows.map((row) => {
    const calculatedPosition = ranks.get(row.contrada_id) ?? null;
    const position = row.is_position_overridden
      ? parsePalioInteger(row.position)
      : calculatedPosition;

    return {
      ...row,
      position: position === null ? '' : String(position),
      points: getAuspiciPoints(position),
    };
  });
}

export type AuspiciInputStatus = 'complete' | 'invalid' | 'missing';

export function validateAuspiciRows(rows: AuspiciCalculatedResultRow[]): {
  completeCount: number;
  invalidCount: number;
  missingCount: number;
  statusByContradaId: Map<string, AuspiciInputStatus>;
} {
  const statusByContradaId = new Map<string, AuspiciInputStatus>();
  let completeCount = 0;
  let invalidCount = 0;
  let missingCount = 0;

  rows.forEach((row) => {
    const position = row.position.trim() === '' ? null : Number.parseInt(row.position, 10);
    const hasInvalidPosition = row.position.trim() !== '' && (position === null || Number.isNaN(position) || position < 1 || position > 12);
    const hasInvalidRawScore = row.raw_score.trim() !== '' && parsePalioNumber(row.raw_score) === null;
    const status: AuspiciInputStatus = hasInvalidPosition || hasInvalidRawScore
      ? 'invalid'
      : position === null
        ? 'missing'
        : 'complete';

    statusByContradaId.set(row.contrada_id, status);
    if (status === 'complete') completeCount += 1;
    if (status === 'invalid') invalidCount += 1;
    if (status === 'missing') missingCount += 1;
  });

  return { completeCount, invalidCount, missingCount, statusByContradaId };
}
