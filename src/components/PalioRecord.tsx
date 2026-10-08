import type { Contrada, PalioEditionResult } from '../hooks/usePalioLiveData';
import { formatNumber } from '../hooks/usePalioLiveData';
import { getPalioRecordStatus, type PalioGameRecord } from '../lib/palio-records';

export function PalioRecordSummary({ record, contrade }: { record?: PalioGameRecord; contrade: Contrada[] }) {
  if (!record) return null;
  return <p className="mb-2 text-sm font-semibold text-amber-200">Record precedente: {formatNumber(record.value)} {record.game === 'melocotogno' ? 'pt fettucce' : 's'} · {contrade.find((contrada) => contrada.id === record.contrada_id)?.name ?? 'Contrada'} · {record.year}</p>;
}

export function PalioRecordBadge({ result, record, contradaName }: { result: PalioEditionResult; record?: PalioGameRecord; contradaName?: string }) {
  const status = getPalioRecordStatus(result, record);
  if (!status) return null;
  return <span className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs font-bold ${status === 'beaten' ? 'border-amber-300 bg-amber-300 text-stone-950' : 'border-amber-200/40 text-amber-200'}`}>{contradaName ? `${contradaName} · ` : ''}{status === 'beaten' ? '🏆 Record battuto!' : 'Record eguagliato'}</span>;
}
