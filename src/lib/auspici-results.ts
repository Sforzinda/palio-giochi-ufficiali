import { parsePalioInteger, parsePalioNumber } from './palio-results';
import type { AuspiciProva } from '../hooks/useAuspiciData';

// Funzioni pure di calcolo/validazione per la Serata degli Auspici. Invece
// di far sommare a mano i piazzamenti/punteggi ai responsabili, si inseriscono
// i valori grezzi di ciascuna componente e l'app calcola piazzamento e
// punteggio (par merito compreso, scala N, N-1, ..., 1 del regolamento punto
// 4, generalizzata al numero effettivo di partecipanti — può superare le 12
// Contrade ufficiali per via delle squadre extra valide solo per l'evento).

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

// Direzione della metrica finale usata per il piazzamento: 'asc' = vince il
// valore più basso (somma piazzamenti/scarti), 'desc' = vince il valore più
// alto (punti/lettere corrette).
export const auspiciProvaDirection: Record<AuspiciProva, 'asc' | 'desc'> = {
  mercante: 'asc',
  memoria: 'desc',
  investitura: 'asc',
  tiro: 'desc',
  giuramento: 'desc',
};

export const auspiciProvaRawScoreLabels: Record<AuspiciProva, string> = {
  mercante: 'Valore stimato da ciascuna squadra per le 5 prove: lo scarto dal valore di riferimento e la classifica si calcolano automaticamente (vince il totale più basso)',
  memoria: 'Sequenza di 20 lettere indicata da ciascuna squadra: le lettere in posizione corretta si contano automaticamente confrontando con la sequenza di riferimento (vince il punteggio più alto)',
  investitura: 'Tempo torre, altezza castello di carte ed elementi corretti/errati dell’horror vacui: piazzamento per ciascuna microabilità (par merito compreso) e somma calcolati automaticamente (vince il totale più basso)',
  tiro: 'Bersagli colpiti: il punteggio (1+2+3+4+5) è calcolato automaticamente (vince il più alto)',
  giuramento: 'Punti 0-5 di ciascun giudice sui 4 criteri: il totale, con eventuale penalità tempo, è calcolato automaticamente (vince il più alto)',
};

export type AuspiciProvaFieldKind = 'count' | 'estimate' | 'hit' | 'metric' | 'score';

export interface AuspiciProvaField {
  // Per i campi 'metric': direzione della classifica su quel singolo valore
  // grezzo ('asc' = vince il più basso, es. un tempo; 'desc' = vince il più
  // alto, es. un'altezza o un conteggio). Non si applica agli altri kind:
  // 'estimate' vince sempre lo scarto più basso dal riferimento, 'hit'/
  // 'score' si sommano direttamente (vedi auspiciProvaDirection a livello di
  // prova).
  direction?: 'asc' | 'desc';
  key: string;
  kind: AuspiciProvaFieldKind;
  label: string;
  max?: number;
  unit?: string;
  value?: number;
}

// Chiave del campo penalità tempo del Giuramento delle Contrade (-3 punti se
// l'esibizione supera i 90 secondi oltre la tolleranza di 5, regolamento
// punto 9.5.6). Non è un campo sommato come gli altri: si sottrae alla fine.
export const AUSPICI_GIURAMENTO_PENALTY_KEY = 'penalty_tempo';

// Chiave del campo sequenza di Memoria Sforzesca, sia nel dettaglio di ogni
// squadra sia nel riferimento dell'edizione.
export const AUSPICI_MEMORIA_SEQUENCE_KEY = 'sequence';

// Chiavi dei campi dell'horror vacui (Investitura): punteggio netto =
// corretti - errori (regolamento punto 9.3.3); l'ordine di consegna è
// facoltativo e vale solo come ultimo criterio di parità.
export const AUSPICI_HORROR_VACUI_CORRETTI_KEY = 'horror_vacui_corretti';
export const AUSPICI_HORROR_VACUI_ERRORI_KEY = 'horror_vacui_errori';
export const AUSPICI_HORROR_VACUI_ORDINE_KEY = 'horror_vacui_ordine';

// Scomposizione nelle singole componenti di ogni prova:
// - 'estimate' (Mercante): valore stimato da confrontare con un valore di
//   riferimento comune all'edizione (auspici_prova_references); vince lo
//   scarto assoluto più basso.
// - 'metric' (Investitura): valore grezzo misurato (tempo, altezza,
//   conteggio), classificato direttamente con la propria direzione.
// - 'hit' (Tiro dell'Auspicio): bersaglio colpito o no, vale i punti del
//   bersaglio se colpito.
// - 'score' (Giuramento): punteggio 0-5 assegnato da un giudice su un
//   criterio.
// Memoria Sforzesca non ha una scomposizione per campo: è gestita a parte
// tramite la sequenza di riferimento e quella di ogni squadra.
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
    { direction: 'asc', key: 'torre', kind: 'metric', label: 'Tempo montaggio torre', unit: 's' },
    { direction: 'desc', key: 'castello', kind: 'metric', label: 'Altezza castello di carte', unit: 'cm' },
    { key: AUSPICI_HORROR_VACUI_CORRETTI_KEY, kind: 'count', label: 'Horror vacui · elementi corretti' },
    { key: AUSPICI_HORROR_VACUI_ERRORI_KEY, kind: 'count', label: 'Horror vacui · elementi errati' },
    { key: AUSPICI_HORROR_VACUI_ORDINE_KEY, kind: 'count', label: 'Horror vacui · ordine di consegna (facoltativo)' },
  ],
  mercante: [
    { key: 'gonfalone', kind: 'estimate', label: 'Peso gonfalone', unit: 'g' },
    { key: 'mais', kind: 'estimate', label: 'Chicchi di mais', unit: 'pz' },
    { key: 'libro', kind: 'estimate', label: 'Pagine libro', unit: 'pag' },
    { key: 'statuetta', kind: 'estimate', label: 'Altezza statuetta', unit: 'cm' },
    { key: 'stivale', kind: 'estimate', label: 'Misura stivale', unit: 'EU' },
  ],
  tiro: [
    { key: 'cesta', kind: 'hit', label: 'Cesta del Borgo', value: 1 },
    { key: 'forziere', kind: 'hit', label: 'Forziere del Mercante', value: 2 },
    { key: 'corona', kind: 'hit', label: 'Corona Ducale', value: 3 },
    { key: 'finestra', kind: 'hit', label: 'Finestra della Torre', value: 4 },
    { key: 'pozzo', kind: 'hit', label: 'Pozzo del Castello', value: 5 },
  ],
};

// Mercante (valore di riferimento) e Memoria (sequenza di riferimento)
// hanno bisogno di un dato condiviso a livello di edizione+prova, salvato
// in auspici_prova_references — non per singola squadra.
export const auspiciProvasWithReference: AuspiciProva[] = ['mercante', 'memoria'];

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

// Classifica generica basata su un comparatore invece che su un singolo
// valore numerico: serve per l'horror vacui, dove il piazzamento dipende da
// più criteri in cascata (punteggio netto, poi meno errori, poi ordine di
// consegna). compare(a, b) < 0 significa "a è meglio di b"; 0 significa pari
// merito su tutti i criteri disponibili.
const rankByComparator = <T,>(
  items: { participant_id: string; value: T | null }[],
  compare: (a: T, b: T) => number
): Map<string, number | null> => {
  const withValue = items.filter(
    (item): item is { participant_id: string; value: T } => item.value !== null
  );
  const ranks = new Map<string, number | null>();

  items.forEach((item) => {
    if (item.value === null) ranks.set(item.participant_id, null);
  });
  withValue.forEach((item) => {
    const betterCount = withValue.filter((other) => compare(other.value, item.value) < 0).length;
    ranks.set(item.participant_id, betterCount + 1);
  });

  return ranks;
};

interface AuspiciHorrorVacuiEntry {
  errori: number;
  net: number;
  ordine: number | null;
}

// Piazzamento dell'horror vacui (regolamento punto 9.3.3): punteggio netto
// (corretti - errori) più alto vince; a parità, meno errori; persistendo la
// parità, chi ha consegnato per prima (se l'ordine è stato inserito).
const compareAuspiciHorrorVacui = (a: AuspiciHorrorVacuiEntry, b: AuspiciHorrorVacuiEntry): number => {
  if (a.net !== b.net) return a.net > b.net ? -1 : 1;
  if (a.errori !== b.errori) return a.errori < b.errori ? -1 : 1;
  if (a.ordine !== null && b.ordine !== null && a.ordine !== b.ordine) return a.ordine < b.ordine ? -1 : 1;
  return 0;
};

// Normalizza una sequenza inserita a mano (lettere/codici separati da
// virgole o spazi) in un array di codici confrontabili.
export const parseAuspiciSequence = (raw: string): string[] =>
  raw
    .split(/[,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0);

// Punteggio di Memoria Sforzesca: un punto per ogni lettera nella posizione
// esatta rispetto alla sequenza di riferimento (regolamento punto 9.2.4).
export function computeAuspiciMemoriaScore(participantSequenceRaw: string, referenceSequenceRaw: string): number | null {
  const participant = parseAuspiciSequence(participantSequenceRaw);
  const reference = parseAuspiciSequence(referenceSequenceRaw);
  if (participant.length === 0 || reference.length === 0) return null;

  let correct = 0;
  reference.forEach((code, index) => {
    if (participant[index] === code) correct += 1;
  });
  return correct;
}

// Somma i valori grezzi delle componenti a somma diretta di una prova
// (bersagli colpiti, punti dei giudici) nell'unica metrica usata per il
// piazzamento. Non si applica a Mercante/Investitura (piazzamento per
// componente, vedi calculateAuspiciRows) né a Memoria (sequenza).
function computeAuspiciSummedRawScore(prova: AuspiciProva, detail: Record<string, string>): number | null {
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

export function calculateAuspiciRows(
  rows: AuspiciResultInput[],
  prova: AuspiciProva,
  reference: Record<string, string> = {}
): AuspiciCalculatedResultRow[] {
  const direction = auspiciProvaDirection[prova];
  const totalParticipants = rows.length;
  const fields = auspiciProvaFields[prova];
  const hasComponentRanking = Boolean(fields?.some((field) => field.kind === 'estimate'));

  let finalValues: { participant_id: string; value: number | null }[];

  if (prova === 'memoria') {
    const referenceSequence = reference[AUSPICI_MEMORIA_SEQUENCE_KEY] ?? '';
    finalValues = rows.map((row) => ({
      participant_id: row.participant_id,
      value: computeAuspiciMemoriaScore(row.detail[AUSPICI_MEMORIA_SEQUENCE_KEY] ?? '', referenceSequence),
    }));
  } else if (prova === 'investitura') {
    // Ogni microabilità (torre, castello, horror vacui) ha la propria
    // classifica indipendente; il piazzamento finale è la somma dei tre
    // piazzamenti (regolamento punto 9.3.5).
    const torreDirection = fields?.find((field) => field.key === 'torre')?.direction ?? 'asc';
    const castelloDirection = fields?.find((field) => field.key === 'castello')?.direction ?? 'desc';
    const torreRanks = rankAuspiciValues(
      rows.map((row) => ({ participant_id: row.participant_id, value: parsePalioNumber(row.detail.torre ?? '') })),
      torreDirection
    );
    const castelloRanks = rankAuspiciValues(
      rows.map((row) => ({ participant_id: row.participant_id, value: parsePalioNumber(row.detail.castello ?? '') })),
      castelloDirection
    );
    const horrorVacuiEntries = rows.map((row) => {
      const corretti = parsePalioInteger(row.detail[AUSPICI_HORROR_VACUI_CORRETTI_KEY] ?? '');
      const errori = parsePalioInteger(row.detail[AUSPICI_HORROR_VACUI_ERRORI_KEY] ?? '');
      if (corretti === null && errori === null) {
        return { participant_id: row.participant_id, value: null };
      }
      return {
        participant_id: row.participant_id,
        value: {
          errori: errori ?? 0,
          net: (corretti ?? 0) - (errori ?? 0),
          ordine: parsePalioInteger(row.detail[AUSPICI_HORROR_VACUI_ORDINE_KEY] ?? ''),
        },
      };
    });
    const horrorVacuiRanks = rankByComparator(horrorVacuiEntries, compareAuspiciHorrorVacui);

    finalValues = rows.map((row) => {
      const torre = torreRanks.get(row.participant_id);
      const castello = castelloRanks.get(row.participant_id);
      const horrorVacui = horrorVacuiRanks.get(row.participant_id);
      if (torre == null || castello == null || horrorVacui == null) {
        return { participant_id: row.participant_id, value: null };
      }
      return { participant_id: row.participant_id, value: torre + castello + horrorVacui };
    });
  } else if (hasComponentRanking && fields) {
    // Ogni componente (stima) ha la propria classifica; il piazzamento
    // finale è la somma dei piazzamenti di componente.
    const ranksByField = fields.map((field) => {
      const values = rows.map((row) => {
        const raw = parsePalioNumber(row.detail[field.key] ?? '');
        const referenceValue = parsePalioNumber(reference[field.key] ?? '');
        const scarto = raw !== null && referenceValue !== null ? Math.abs(raw - referenceValue) : null;
        return { participant_id: row.participant_id, value: scarto };
      });
      return rankAuspiciValues(values, 'asc');
    });

    finalValues = rows.map((row) => {
      let sum = 0;
      let hasAny = false;
      ranksByField.forEach((ranks) => {
        const rank = ranks.get(row.participant_id);
        if (rank !== null && rank !== undefined) {
          sum += rank;
          hasAny = true;
        }
      });
      return { participant_id: row.participant_id, value: hasAny ? sum : null };
    });
  } else if (fields) {
    finalValues = rows.map((row) => ({
      participant_id: row.participant_id,
      value: computeAuspiciSummedRawScore(prova, row.detail),
    }));
  } else {
    finalValues = rows.map((row) => ({
      participant_id: row.participant_id,
      value: parsePalioNumber(row.raw_score),
    }));
  }

  const isDerived = Boolean(fields) || prova === 'memoria';
  const valueByParticipantId = new Map(finalValues.map((item) => [item.participant_id, item.value]));
  const ranks = rankAuspiciValues(finalValues, direction);

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
      raw_score: isDerived ? (effectiveRawScore === null ? '' : String(effectiveRawScore)) : row.raw_score,
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
