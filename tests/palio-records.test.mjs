import assert from 'node:assert/strict';
import test from 'node:test';
import { getPalioRecordStatus, getPalioRecordValue } from '../src/lib/palio-records.ts';

const record = { edition_id: 'edition', game: 'corsa', contrada_id: 'previous', year: 2025, value: '12.30' };
const result = {
  game: 'corsa', contrada_id: 'current', adjusted_time_seconds: '12.20',
  time_seconds: '9.20', penalty_count: 1, is_disqualified: false,
  melocotogno_2_count: null, melocotogno_5_count: null, melocotogno_10_count: null,
  position: null, points: null, final_bonus_points: null,
};

test('tutte le prove a tempo confrontano il tempo ufficiale, non il tempo grezzo', () => {
  for (const game of ['corsa', 'carriola', 'cerchio', 'torre', 'finale']) {
    const row = { ...result, game, penalty_count: 0 };
    assert.equal(getPalioRecordStatus(row, { ...record, game }), 'beaten');
    assert.equal(getPalioRecordStatus({ ...row, adjusted_time_seconds: '12.40' }, { ...record, game }), null);
  }
  assert.equal(getPalioRecordStatus({ ...result, adjusted_time_seconds: '12.40' }, record), null);
});

test('il Melocotogno confronta il totale fettucce in ordine decrescente, non i punti Palio', () => {
  const row = { ...result, game: 'melocotogno', melocotogno_2_count: 1, melocotogno_5_count: 2, melocotogno_10_count: 3, points: 1 };
  const previous = { ...record, game: 'melocotogno', value: 40 };
  assert.equal(getPalioRecordValue(row), 42);
  assert.equal(getPalioRecordStatus(row, previous), 'beaten');
  assert.equal(getPalioRecordStatus(row, { ...previous, value: 42 }), 'equal');
  assert.equal(getPalioRecordStatus(row, { ...previous, value: 44 }), null);
});

test('un record eguagliato non è battuto, anche con imprecisioni floating point', () => {
  assert.equal(getPalioRecordStatus({ ...result, adjusted_time_seconds: 12.3 }, record), 'equal');
  assert.equal(getPalioRecordStatus({ ...result, adjusted_time_seconds: 12.30000000001 }, record), 'equal');
});

test('squalifiche, senza giocatori e penalità carriola non producono record', () => {
  for (const game of ['corsa', 'carriola', 'cerchio', 'torre', 'finale', 'melocotogno']) {
    assert.equal(getPalioRecordValue({ ...result, game, is_disqualified: true }), null);
    assert.equal(getPalioRecordValue({ ...result, game, penalty_count: 999 }), null);
  }
  assert.equal(getPalioRecordValue({ ...result, game: 'carriola' }), null);
});

test('tempi mancanti, negativi, zero, non finiti e sentinelle sono esclusi', () => {
  for (const adjusted_time_seconds of [null, '', '-1', '0', 'abc', 'Infinity', 999, 1000]) {
    assert.equal(getPalioRecordValue({ ...result, adjusted_time_seconds }), null);
  }
});

test('fettucce mancanti o non valide sono escluse, zero esplicito è valido', () => {
  const row = { ...result, game: 'melocotogno' };
  assert.equal(getPalioRecordValue(row), null);
  assert.equal(getPalioRecordValue({ ...row, melocotogno_2_count: 0 }), 0);
  for (const count of [-1, 0.5, 25, NaN]) {
    assert.equal(getPalioRecordValue({ ...row, melocotogno_2_count: count }), null);
  }
  assert.equal(getPalioRecordValue({ ...row, melocotogno_2_count: 12, melocotogno_10_count: 13 }), null);
});

test('assenza di record o record di un altro gioco non genera segnalazioni', () => {
  assert.equal(getPalioRecordStatus(result), null);
  assert.equal(getPalioRecordStatus(result, { ...record, game: 'torre' }), null);
});
