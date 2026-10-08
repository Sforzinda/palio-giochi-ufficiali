import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../config';
import type { Contrada, PalioEdition, PalioGame } from '../hooks/usePalioLiveData';
import type { PalioGameRecord } from '../lib/palio-records';
import { parsePalioNumber } from '../lib/palio-results';
import { PalioRecordSummary } from './PalioRecord';

interface Props {
  contrade: Contrada[];
  edition: PalioEdition;
  game: PalioGame;
  record?: PalioGameRecord;
  loading: boolean;
  error: string;
  onSaved: () => void;
}

export function PalioRecordInput({ contrade, edition, game, record, loading, error, onSaved }: Props) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contradaId, setContradaId] = useState('');
  const [year, setYear] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setContradaId(record?.contrada_id ?? '');
    setYear(record ? String(record.year) : '');
    setValue(record ? String(record.value) : '');
    setMessage('');
  }, [record]);

  async function save(remove = false) {
    const parsedYear = Number(year);
    const parsedValue = parsePalioNumber(value);
    if (!remove && (!contrade.some((contrada) => contrada.id === contradaId) || !Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > edition.year || parsedValue === null || parsedValue <= 0 || parsedValue >= 999 || Math.abs(parsedValue * 100 - Math.round(parsedValue * 100)) > 0.000001 || (game === 'melocotogno' && (!Number.isInteger(parsedValue) || parsedValue > 240)))) {
      setMessage('Seleziona la contrada, un anno non successivo all’edizione e un valore positivo: fino a due decimali per i secondi, intero fino a 240 per le fettucce.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const { error: saveError } = remove
        ? await supabase.from('palio_game_records').delete().eq('edition_id', edition.id).eq('game', game)
        : await supabase.from('palio_game_records').upsert({ edition_id: edition.id, game, contrada_id: contradaId, year: parsedYear, value: parsedValue }, { onConflict: 'edition_id,game' });
      if (saveError) { setMessage(`Record non salvato: ${saveError.message}`); return; }
      onSaved();
      setMessage(remove ? 'Record rimosso.' : 'Record salvato.');
    } catch {
      setMessage('Record non salvato: connessione non disponibile. Riprova.');
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-4 rounded-lg border border-stone-700 bg-stone-900 p-4">
      <h3 className="mb-2 font-semibold text-stone-100">Record precedente</h3>
      <p className="mb-3 text-xs text-stone-400">Riferimento per questa edizione. Usa il tempo ufficiale comprensivo delle penalità o il totale dei punti fettucce; il record non viene sostituito automaticamente.</p>
      <PalioRecordSummary record={record} contrade={contrade} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-stone-300">Contrada
          <select className="mt-1 block w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2" value={contradaId} onChange={(event) => setContradaId(event.target.value)} disabled={saving || loading || !!error}>
            <option value="">Seleziona la contrada</option>
            {contrade.map((contrada) => <option key={contrada.id} value={contrada.id}>{contrada.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-stone-300">Anno
          <input className="mt-1 block w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2" type="number" min={1} max={edition.year} step={1} value={year} onChange={(event) => setYear(event.target.value)} disabled={saving || loading || !!error} />
        </label>
        <label className="text-sm text-stone-300">{game === 'melocotogno' ? 'Punti fettucce' : 'Tempo ufficiale (secondi)'}
          <input className="mt-1 block w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2" type="text" inputMode={game === 'melocotogno' ? 'numeric' : 'decimal'} value={value} onChange={(event) => setValue(event.target.value)} disabled={saving || loading || !!error} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-md bg-palio-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void save()} disabled={saving || loading || !!error}>{saving ? 'Salvataggio…' : 'Salva record'}</button>
        {record && <button type="button" className="rounded-md border border-stone-700 px-3 py-2 text-sm text-stone-300 disabled:opacity-50" onClick={() => void save(true)} disabled={saving || loading || !!error}>Rimuovi record</button>}
      </div>
      {(error || message) && <p role="status" className="mt-2 text-sm text-amber-200">{error || message}</p>}
    </div>
  );
}
