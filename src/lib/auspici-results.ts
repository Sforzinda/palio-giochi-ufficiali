import { parsePalioInteger, parsePalioNumber } from './palio-results';
import type { AuspiciProva } from '../hooks/useAuspiciData';

// Funzioni pure di calcolo/validazione per la Serata degli Auspici. A
// differenza dei Giochi del Palio, ogni prova produce una sola metrica
// grezza (raw_score) già riassuntiva — somma piazzamenti, lettere corrette,
// punti bersaglio, punti giudici — calcolata dai giudici secondo il
// Regolamento Cena degli Auspici; qui si applica solo il piazzamento
// (par merito compreso) e la scala di punti N, N-1, ..., 1 già usata nei
// Giochi del Palio [regolamento punto 4], generalizzata al numero effettivo
// di partecipanti (che può superare le 12 Contrade ufficiali per via delle
// squadre extra valide solo per questo evento).

export interface AuspiciResultInput {
  detail: Record<string, string>;
  is_position_overridden: boolean;
  notes: string;
  participant_id: string;
  position: string;
  raw_score: string;
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
  mercante: 'Piazzamento (1°...N°) di ciascuna delle 5 stime: la somma è calcolata automaticamente (vince il più basso)',
  memoria: 'Lettere corrette su 20 (vince il più alto)',
  investitura: 'Piazzamento (1°...N°) di ciascuna delle 3 microabilità: la somma è calcolata automaticamente (vince il più basso)',
  tiro: 'Bersagli colpiti: il punteggio (1+2+3+4+5) è calcolato automaticamente (vince il più alto)',
  giuramento: 'Punti 0-5 di ciascun giudice sui 4 criteri: il totale, con eventuale penalità tempo, è calcolato automaticamente (vince il più alto)',
};

export type AuspiciProvaFieldKind = 'hit' | 'placement' | 'score';

export interface AuspiciProvaField {
  key: string;
  kind: AuspiciProvaFieldKind;
  label: string;
  max?: number;
  value?: number;
}

// Chiave del campo penalità tempo del Giuramento delle Contrade (-3 punti se
// l'esibizione supera i 90 secondi oltre la tolleranza di 5, regolamento
// punto 9.5.6). Non è un campo sommato come gli altri: si sottrae alla fine.
export const AUSPICI_GIURAMENTO_PENALTY_KEY = 'penalty_tempo';

// Scomposizione nelle singole componenti di ogni prova, così i responsabili
// inseriscono i valori grezzi (piazzamento di ogni stima/microabilità,
// bersaglio colpito, punteggio di ogni giudice) e l'app calcola la somma da
// sola, invece di doverla sommare a mano prima di inserirla. Memoria
// Sforzesca non ha sotto-componenti: resta un unico valore grezzo (lettere
// corrette).
export const auspiciProvaFields: Partial<Record<AuspiciProva, AuspiciProvaField[]>> = {
  giuramento: [
    { key: 'g1_vincoli', kind: 'score', label: 'Giudice 1 · vincoli', max: 5 },
    { key: 'g1_creativita', kind: 'score', label: 'Giudice 1 · creatività', max: 5 },
    { key: 'g1_esecuzione', kind: 'score', label: 'Giudice 1 · esecuzione', max: 5 },
    { key: 'g1_spirito', kind: 'score', label: 'Giudice 1 · spirito', max: 5 },
    { key: 'g2_vincoli', kind: 'score', label: 'Giudice 2 · vincoli', max: 5 },
    { key: 'g2_creativita', kind: 'score', label: 'Giudice 2 · creatività', max: 5 },
    { key: 'g2_esecuzione', kind: 'score', label: 'Giudice 2 · esecuzione', max: 5 },
    { key: 'g2_spirito', kind: 'score', label: 'Giudice 2 · spirito', max: 5 },
    { key: 'g3_vincoli', kind: 'score', label: 'Giudice 3 · vincoli', max: 5 },
    { key: 'g3_creativita', kind: 'score', label: 'Giudice 3 · creatività', max: 5 },
    { key: 'g3_esecuzione', kind: 'score', label: 'Giudice 3 · esecuzione', max: 5 },
    { key: 'g3_spirito', kind: 'score', label: 'Giudice 3 · spirito', max: 5 },
  ],
  investitura: [
    { key: 'torre', kind: 'placement', label: 'Montaggio della torre' },
    { key: 'castello', kind: 'placement', label: 'Castello di carte' },
    { key: 'horror_vacui', kind: 'placement', label: 'Ricerca horror vacui' },
  ],
  mercante: [
    { key: 'gonfalone', kind: 'placement', label: 'Peso del gonfalone' },
    { key: 'mais', kind: 'placement', label: 'Chicchi di mais' },
    { key: 'libro', kind: 'placement', label: 'Pagine del libro' },
    { key: 'statuetta', kind: 'placement', label: 'Altezza statuetta' },
    { key: 'stivale', kind: 'placement', label: 'Misura stivale' },
  ],
  tiro: [
    { key: 'cesta', kind: 'hit', label: 'Cesta del Borgo', value: 1 },
    { key: 'forziere', kind: 'hit', label: 'Forziere del Mercante', value: 2 },
    { key: 'corona', kind: 'hit', label: 'Corona Ducale', value: 3 },
    { key: 'finestra', kind: 'hit', label: 'Finestra della Torre', value: 4 },
    { key: 'pozzo', kind: 'hit', label: 'Pozzo del Castello', value: 5 },
  ],
};

export const auspiciCartaLabels: Record<'duca' | 'duchessa' | 'armato' | 'fornaio' | 'mastro_falconiere', string> = {
  duca: 'Duca – Vederci chiaro',
  duchessa: 'Duchessa – Voce segreta',
  armato: 'Armato – Protezione',
  fornaio: 'Fornaio – Ritorno in vita',
  mastro_falconiere: 'Mastro Falconiere – Comando',
};

// N, N-1, ..., 1 sul numero effettivo di partecipanti dell'edizione (non
// fisso a 12, per via delle eventuali squadre extra dell'evento).
export const getAuspiciPoints = (position: number | null, totalParticipants: number): number | null =>
  position === null ? null : totalParticipants + 1 - position;

const rankAuspiciValues = (
  items: { participant_id: string; value: number | null }[],
  direction: 'asc' | 'desc'
): Map<string, number | null> => {
  const validValues = items
    .map((item) => item.value)
    .filter((value): value is number => value !== null && !Number.isNaN(value));
  const ranks = new Map<string, number | null>();

  items.forEach((item) => {
    if (item.value === null || Number.isNaN(item.value)) {
      ranks.set(item.participant_id, null);
      return;
    }
    const betterCount = validValues.filter((value) =>
      direction === 'asc' ? value < item.value! : value > item.value!
    ).length;
    ranks.set(item.participant_id, betterCount + 1);
  });

  return ranks;
};

// Somma i valori grezzi delle singole componenti di una prova (piazzamenti,
// bersagli colpiti, punti dei giudici) nell'unica metrica usata per il
// piazzamento. Per Memoria Sforzesca (nessuna scomposizione) torna null: si
// usa direttamente il raw_score inserito a mano.
export function computeAuspiciRawScoreFromDetail(prova: AuspiciProva, detail: Record<string, string>): number | null {
  const fields = auspiciProvaFields[prova];
  if (!fields) return null;

  let sum = 0;
  let hasAny = false;

  fields.forEach((field) => {
    const raw = detail[field.key] ?? '';
    if (field.kind === 'hit') {
      if (raw === 'true') {
        sum += field.value ?? 0;
        hasAny = true;
      }
      return;
    }
    const parsed = parsePalioInteger(raw);
    if (parsed !== null) {
      sum += parsed;
      hasAny = true;
    }
  });

  if (!hasAny) return null;

  if (prova === 'giuramento' && detail[AUSPICI_GIURAMENTO_PENALTY_KEY] === 'true') {
    sum = Math.max(0, sum - 3);
  }

  return sum;
}

export function calculateAuspiciRows(rows: AuspiciResultInput[], prova: AuspiciProva): AuspiciCalculatedResultRow[] {
  const direction = auspiciProvaDirection[prova];
  const totalParticipants = rows.length;
  const hasFields = Boolean(auspiciProvaFields[prova]);
  const values = rows.map((row) => ({
    participant_id: row.participant_id,
    value: hasFields ? computeAuspiciRawScoreFromDetail(prova, row.detail) : parsePalioNumber(row.raw_score),
  }));
  const valueByParticipantId = new Map(values.map((item) => [item.participant_id, item.value]));
  const ranks = rankAuspiciValues(values, direction);

  return rows.map((row) => {
    const calculatedPosition = ranks.get(row.participant_id) ?? null;
    const position = row.is_position_overridden
      ? parsePalioInteger(row.position)
      : calculatedPosition;
    const effectiveRawScore = valueByParticipantId.get(row.participant_id) ?? null;

    return {
      ...row,
      points: getAuspiciPoints(position, totalParticipants),
      position: position === null ? '' : String(position),
      raw_score: hasFields ? (effectiveRawScore === null ? '' : String(effectiveRawScore)) : row.raw_score,
    };
  });
}

export type AuspiciInputStatus = 'complete' | 'invalid' | 'missing';

export function validateAuspiciRows(rows: AuspiciCalculatedResultRow[]): {
  completeCount: number;
  invalidCount: number;
  missingCount: number;
  statusByParticipantId: Map<string, AuspiciInputStatus>;
} {
  const statusByParticipantId = new Map<string, AuspiciInputStatus>();
  let completeCount = 0;
  let invalidCount = 0;
  let missingCount = 0;

  rows.forEach((row) => {
    const position = row.position.trim() === '' ? null : Number.parseInt(row.position, 10);
    const hasInvalidPosition = row.position.trim() !== '' && (position === null || Number.isNaN(position) || position < 1);
    const hasInvalidRawScore = row.raw_score.trim() !== '' && parsePalioNumber(row.raw_score) === null;
    const status: AuspiciInputStatus = hasInvalidPosition || hasInvalidRawScore
      ? 'invalid'
      : position === null
        ? 'missing'
        : 'complete';

    statusByParticipantId.set(row.participant_id, status);
    if (status === 'complete') completeCount += 1;
    if (status === 'invalid') invalidCount += 1;
    if (status === 'missing') missingCount += 1;
  });

  return { completeCount, invalidCount, missingCount, statusByParticipantId };
}
