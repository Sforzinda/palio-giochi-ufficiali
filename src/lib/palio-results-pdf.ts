import type { Contrada, PalioEdition, PalioEditionHeat, PalioGame } from '../hooks/usePalioLiveData';
import { createDoc, drawPageHeader, fileSlug, getEditionHeader, type PdfDoc } from './palio-judge-sheets';

// PDF dei risultati ufficiali di un'edizione: un foglio per ogni prova a
// batterie (con tempi, penalità, punti e note), melocotogno, finale e
// classifica con il vincitore del Palio.

export interface PalioResultsPdfResult {
  adjusted_time_seconds: number | string | null;
  contrada_id: string;
  game: PalioGame;
  is_disqualified: boolean | null;
  melocotogno_2_count: number | null;
  melocotogno_5_count: number | null;
  melocotogno_10_count: number | null;
  notes: string | null;
  penalty_count: number | null;
  points: number | string | null;
  position: number | null;
  time_seconds: number | string | null;
}

interface ResultsPdfInput {
  contrade: Contrada[];
  edition: PalioEdition;
  heats: PalioEditionHeat[];
  liveTitle: string;
  results: PalioResultsPdfResult[];
  winnerContradaId: string | null;
}

interface Column {
  align?: 'center' | 'left';
  header: string;
  width: number;
}

interface TableRow {
  bold?: boolean;
  cells: string[];
  fill?: [number, number, number];
}

const MARGIN_X = 10;
const PAGE_BOTTOM = 285;
const CONTENT_TOP = 46;
const LINE_HEIGHT = 4.2;

const gameTitles: Record<PalioGame, string> = {
  carriola: 'Corsa con le Carriole',
  cerchio: 'Corsa col Cerchio',
  corsa: 'Corsa',
  finale: 'Triplice Tenzone - Finale',
  melocotogno: 'Melocotogno',
  torre: 'Costruzione della Torre',
};

const gameColumnHeaders: Record<PalioGame, string> = {
  carriola: 'Carriole',
  cerchio: 'Cerchio',
  corsa: 'Corsa',
  finale: 'Finale',
  melocotogno: 'Melocotogno',
  torre: 'Torre',
};

const baseGameOrder: PalioGame[] = ['melocotogno', 'corsa', 'carriola', 'cerchio', 'torre'];

const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '-';
  const parsed = Number(value);
  return Number.isNaN(parsed) ? '-' : parsed.toLocaleString('it-IT', { maximumFractionDigits: 2 });
};

const formatPosition = (position: number | null) => (position ? `${position}°` : '-');

function timeCells(result: PalioResultsPdfResult | undefined, noPlayers: boolean): string[] {
  if (noPlayers) return ['-', '-', 'Senza giocatori'];
  if (!result) return ['-', '-', '-'];
  const finalTime = result.is_disqualified ? 'N.A.' : formatNumber(result.adjusted_time_seconds);
  return [formatNumber(result.time_seconds), String(result.penalty_count ?? 0), finalTime];
}

class PdfWriter {
  private y = CONTENT_TOP;

  constructor(private doc: PdfDoc, private headerLines: [string, string]) {
    drawPageHeader(doc, headerLines);
  }

  newPage() {
    this.doc.addPage();
    drawPageHeader(this.doc, this.headerLines);
    this.y = CONTENT_TOP;
  }

  private ensureSpace(height: number) {
    if (this.y + height > PAGE_BOTTOM) this.newPage();
  }

  title(text: string, size = 20) {
    this.ensureSpace(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(text, 105, this.y + 6, { align: 'center' });
    this.y += 14;
  }

  subtitle(text: string) {
    this.ensureSpace(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(text, MARGIN_X, this.y + 4);
    this.y += 7;
  }

  banner(text: string) {
    this.ensureSpace(14);
    this.doc.setFillColor(255, 236, 170);
    this.doc.setDrawColor(200, 150, 20);
    this.doc.rect(MARGIN_X, this.y, 190, 11, 'FD');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(text, 105, this.y + 7.5, { align: 'center' });
    this.y += 16;
  }

  spacer(height = 6) {
    this.y += height;
  }

  table(columns: Column[], rows: TableRow[]) {
    const drawRow = (cells: string[], options: { bold?: boolean; fill: [number, number, number] }) => {
      this.doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
      this.doc.setFontSize(9);
      const wrapped = cells.map((cell, index) => this.doc.splitTextToSize(cell, columns[index].width - 3) as string[]);
      const height = Math.max(6.5, Math.max(...wrapped.map((lines) => lines.length)) * LINE_HEIGHT + 2.5);
      this.ensureSpace(height);

      let x = MARGIN_X;
      columns.forEach((column, index) => {
        this.doc.setDrawColor(150, 150, 150);
        this.doc.setLineWidth(0.2);
        this.doc.setFillColor(...options.fill);
        this.doc.rect(x, this.y, column.width, height, 'FD');
        this.doc.setTextColor(0, 0, 0);
        this.doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
        this.doc.setFontSize(9);
        const lines = wrapped[index];
        const textY = this.y + (height - lines.length * LINE_HEIGHT) / 2 + 3;
        if (column.align === 'left') {
          this.doc.text(lines, x + 1.5, textY);
        } else {
          this.doc.text(lines, x + column.width / 2, textY, { align: 'center' });
        }
        x += column.width;
      });
      this.y += height;
    };

    const drawHeader = () => drawRow(columns.map((column) => column.header), { bold: true, fill: [190, 192, 191] });
    this.ensureSpace(20);
    drawHeader();
    rows.forEach((row, index) => {
      const shade = index % 2 === 0 ? 255 : 244;
      drawRow(row.cells, { bold: row.bold, fill: row.fill ?? [shade, shade, shade] });
    });
    this.y += 6;
  }
}

function buildHeatGameSection(writer: PdfWriter, input: ResultsPdfInput, game: PalioGame) {
  const contradaNames = new Map(input.contrade.map((contrada) => [contrada.id, contrada.name]));
  const gameResults = new Map(input.results.filter((result) => result.game === game).map((result) => [result.contrada_id, result]));
  const gameHeats = input.heats
    .filter((heat) => heat.game === game)
    .sort((a, b) => a.heat_number - b.heat_number || a.display_order - b.display_order);
  const heatNumbers = Array.from(new Set(gameHeats.map((heat) => heat.heat_number)));

  const columns: Column[] = [
    { header: 'Corsia', width: 14 },
    { align: 'left', header: 'Contrada', width: 44 },
    { header: 'Tempo (s)', width: 20 },
    { header: 'Penalità', width: 17 },
    { header: 'Tempo finale', width: 24 },
    { header: 'Pos.', width: 12 },
    { header: 'Punti', width: 13 },
    { align: 'left', header: 'Note', width: 46 },
  ];

  writer.title(gameTitles[game]);
  heatNumbers.forEach((heatNumber) => {
    writer.subtitle(`Batteria ${heatNumber}`);
    writer.table(
      columns,
      gameHeats
        .filter((heat) => heat.heat_number === heatNumber)
        .map((heat) => {
          const result = gameResults.get(heat.contrada_id);
          const [time, penalties, finalTime] = timeCells(result, heat.no_players);
          return {
            cells: [
              String(heat.display_order),
              contradaNames.get(heat.contrada_id) ?? 'Contrada',
              time,
              penalties,
              finalTime,
              formatPosition(result?.position ?? null),
              formatNumber(result?.points),
              result?.notes?.trim() ?? '',
            ],
          };
        })
    );
  });
}

function buildMelocotognoSection(writer: PdfWriter, input: ResultsPdfInput) {
  const contradaNames = new Map(input.contrade.map((contrada) => [contrada.id, contrada.name]));
  const noPlayers = new Set(input.heats.filter((heat) => heat.game === 'melocotogno' && heat.no_players).map((heat) => heat.contrada_id));
  const rows = input.results
    .filter((result) => result.game === 'melocotogno')
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  writer.title(gameTitles.melocotogno);
  writer.table(
    [
      { header: 'Pos.', width: 14 },
      { align: 'left', header: 'Contrada', width: 46 },
      { header: 'Da 2', width: 15 },
      { header: 'Da 5', width: 15 },
      { header: 'Da 10', width: 15 },
      { header: 'Totale', width: 18 },
      { header: 'Punti', width: 14 },
      { align: 'left', header: 'Note', width: 53 },
    ],
    rows.map((result) => {
      const total =
        (result.melocotogno_2_count ?? 0) * 2 + (result.melocotogno_5_count ?? 0) * 5 + (result.melocotogno_10_count ?? 0) * 10;
      const isNoPlayers = noPlayers.has(result.contrada_id);
      return {
        cells: [
          formatPosition(result.position),
          contradaNames.get(result.contrada_id) ?? 'Contrada',
          isNoPlayers ? '-' : String(result.melocotogno_2_count ?? 0),
          isNoPlayers ? '-' : String(result.melocotogno_5_count ?? 0),
          isNoPlayers ? '-' : String(result.melocotogno_10_count ?? 0),
          isNoPlayers ? 'Senza giocatori' : String(total),
          formatNumber(result.points),
          result.notes?.trim() ?? '',
        ],
      };
    })
  );
}

function buildFinaleSection(writer: PdfWriter, input: ResultsPdfInput) {
  const contradaNames = new Map(input.contrade.map((contrada) => [contrada.id, contrada.name]));
  const rows = input.results
    .filter((result) => result.game === 'finale')
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  writer.title(gameTitles.finale);
  writer.table(
    [
      { header: 'Pos.', width: 14 },
      { align: 'left', header: 'Contrada', width: 46 },
      { header: 'Tempo (s)', width: 24 },
      { header: 'Penalità', width: 20 },
      { header: 'Tempo finale', width: 26 },
      { align: 'left', header: 'Note', width: 60 },
    ],
    rows.map((result) => {
      const [time, penalties, finalTime] = timeCells(result, false);
      const isWinner = result.contrada_id === input.winnerContradaId;
      return {
        bold: isWinner,
        cells: [
          formatPosition(result.position),
          contradaNames.get(result.contrada_id) ?? 'Contrada',
          time,
          penalties,
          finalTime,
          result.notes?.trim() ?? '',
        ],
        fill: isWinner ? ([255, 236, 170] as [number, number, number]) : undefined,
      };
    })
  );
}

function buildRankingSection(writer: PdfWriter, input: ResultsPdfInput, games: PalioGame[]) {
  const totals = input.contrade.map((contrada) => {
    const byGame = games.map((game) => {
      const points = input.results.find((result) => result.game === game && result.contrada_id === contrada.id)?.points;
      return points === null || points === undefined || points === '' ? null : Number(points);
    });
    return { byGame, name: contrada.name, total: byGame.reduce<number>((sum, points) => sum + (points ?? 0), 0) };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'it'));

  let previousTotal: number | null = null;
  let previousRank = 0;
  const rows = totals.map((item, index) => {
    const rank = previousTotal === item.total ? previousRank : index + 1;
    previousTotal = item.total;
    previousRank = rank;
    return {
      cells: [`${rank}°`, item.name, ...item.byGame.map((points) => formatNumber(points)), formatNumber(item.total)],
    };
  });

  const gameColumnWidth = 24;
  writer.title('Classifica dopo le prove');
  writer.table(
    [
      { header: 'Pos.', width: 16 },
      { align: 'left', header: 'Contrada', width: 190 - 16 - 22 - games.length * gameColumnWidth },
      ...games.map((game) => ({ header: gameColumnHeaders[game], width: gameColumnWidth })),
      { header: 'Totale', width: 22 },
    ],
    rows
  );
}

/**
 * PDF con i risultati ufficiali dell'edizione: prove a batterie, melocotogno,
 * classifica e finale con il vincitore del Palio, incluse le note.
 */
export async function downloadResultsPdf(input: ResultsPdfInput): Promise<void> {
  const doc = await createDoc();
  const writer = new PdfWriter(doc, getEditionHeader(input));
  const presentGames = baseGameOrder.filter((game) => input.results.some((result) => result.game === game));
  const winnerName = input.contrade.find((contrada) => contrada.id === input.winnerContradaId)?.name;

  presentGames.forEach((game, index) => {
    if (index > 0) writer.newPage();
    if (game === 'melocotogno') buildMelocotognoSection(writer, input);
    else buildHeatGameSection(writer, input, game);
  });

  writer.newPage();
  buildRankingSection(writer, input, presentGames);

  if (input.results.some((result) => result.game === 'finale')) {
    buildFinaleSection(writer, input);
  }
  if (winnerName) writer.banner(`VINCITORE DEL PALIO: ${winnerName.toUpperCase()}`);

  doc.save(`risultati-${fileSlug(input.edition)}.pdf`);
}
