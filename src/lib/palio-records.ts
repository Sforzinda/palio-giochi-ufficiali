import type { PalioEditionResult, PalioGame } from '../hooks/usePalioLiveData';

export interface PalioGameRecord {
  edition_id: string;
  game: PalioGame;
  contrada_id: string;
  year: number;
  value: number | string;
}

export function getPalioRecordValue(result: PalioEditionResult): number | null {
  if (result.is_disqualified || (result.penalty_count ?? 0) >= 999) return null;
  if (result.game === 'carriola' && (result.penalty_count ?? 0) > 0) return null;
  if (result.game === 'melocotogno') {
    const counts = [result.melocotogno_2_count, result.melocotogno_5_count, result.melocotogno_10_count];
    if (counts.every((count) => count === null)) return null;
    if (counts.some((count) => count !== null && (!Number.isInteger(count) || count < 0))) return null;
    if (counts.reduce<number>((sum, count) => sum + (count ?? 0), 0) > 24) return null;
    return (counts[0] ?? 0) * 2 + (counts[1] ?? 0) * 5 + (counts[2] ?? 0) * 10;
  }
  const raw = result.adjusted_time_seconds;
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value < 999 ? value : null;
}

export function getPalioRecordStatus(result: PalioEditionResult, record?: PalioGameRecord): 'beaten' | 'equal' | null {
  if (!record || record.game !== result.game) return null;
  const value = getPalioRecordValue(result);
  const previous = Number(record.value);
  if (value === null || !Number.isFinite(previous) || previous <= 0) return null;
  // I risultati ufficiali e i record sono espressi al centesimo.
  const current = Math.round(value * 100);
  const baseline = Math.round(previous * 100);
  if (current === baseline) return 'equal';
  return (result.game === 'melocotogno' ? current > baseline : current < baseline) ? 'beaten' : null;
}

export const findPalioRecord = (records: PalioGameRecord[], game: PalioGame) => records.find((record) => record.game === game);
