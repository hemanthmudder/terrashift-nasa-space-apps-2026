/**
 * climate_daily.csv contract (docs/METHODOLOGY.md §4.2) and strict parser.
 *
 * - Column names and order must match exactly; anything else is rejected.
 * - Empty cells become null, never 0.
 * - Numbers must be finite; dates must be valid YYYY-MM-DD.
 * - qc_flag is kept per row so summaries can respect it.
 */

export const CLIMATE_COLUMNS = [
  "date",
  "tmean_c",
  "tmax_c",
  "tmin_c",
  "precip_mm",
  "rh_pct",
  "wind_ms",
  "srad_mj_m2",
  "soil_wet_top",
  "soil_wet_root",
  "gdd_c",
  "qc_flag",
  "qc_fields",
] as const;

export const NUMERIC_COLUMNS = [
  "tmean_c",
  "tmax_c",
  "tmin_c",
  "precip_mm",
  "rh_pct",
  "wind_ms",
  "srad_mj_m2",
  "soil_wet_top",
  "soil_wet_root",
  "gdd_c",
] as const;

export type NumericColumn = (typeof NUMERIC_COLUMNS)[number];
export type QcFlag = "ok" | "missing" | "out_of_range";

export type ClimateRow = { date: string; qcFlag: QcFlag; qcFields: string[] } & Record<NumericColumn, number | null>;

/** Units exactly as defined in the contract. */
export const COLUMN_UNITS: Record<NumericColumn, string> = {
  tmean_c: "°C",
  tmax_c: "°C",
  tmin_c: "°C",
  precip_mm: "mm/day",
  rh_pct: "%",
  wind_ms: "m/s",
  srad_mj_m2: "MJ/m²/day",
  soil_wet_top: "0–1 (model wetness)",
  soil_wet_root: "0–1 (model wetness)",
  gdd_c: "°C·day",
};

export class ClimateCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClimateCsvError";
  }
}

const QC_FLAGS: ReadonlySet<string> = new Set(["ok", "missing", "out_of_range"]);

function parseCell(raw: string, column: string, line: number): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new ClimateCsvError(`Line ${line}: ${column} is not a number ("${raw}").`);
  return n;
}

/** Splits one CSV line. The contract has no quoted fields; quotes are rejected. */
function splitLine(line: string, lineNo: number): string[] {
  if (line.includes('"')) throw new ClimateCsvError(`Line ${lineNo}: quoted fields are not part of the contract.`);
  return line.split(",");
}

export function parseClimateCsv(text: string): ClimateRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l, i, arr) => !(l === "" && i === arr.length - 1));
  if (lines.length === 0 || lines[0].trim() === "") throw new ClimateCsvError("The file is empty.");
  const header = splitLine(lines[0], 1).map((h) => h.trim());
  if (header.length !== CLIMATE_COLUMNS.length || header.some((h, i) => h !== CLIMATE_COLUMNS[i])) {
    throw new ClimateCsvError(`Unexpected header. Expected: ${CLIMATE_COLUMNS.join(",")}. Found: ${header.join(",")}.`);
  }

  const rows: ClimateRow[] = [];
  let prevDate = "";
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    if (lines[i] === "") throw new ClimateCsvError(`Line ${lineNo}: blank line.`);
    const cells = splitLine(lines[i], lineNo);
    if (cells.length !== CLIMATE_COLUMNS.length) {
      throw new ClimateCsvError(`Line ${lineNo}: expected ${CLIMATE_COLUMNS.length} fields, found ${cells.length}.`);
    }
    const date = cells[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new ClimateCsvError(`Line ${lineNo}: invalid date "${date}".`);
    }
    if (date <= prevDate) throw new ClimateCsvError(`Line ${lineNo}: dates must be unique and increasing (${date}).`);
    prevDate = date;
    const qc = cells[11].trim();
    if (!QC_FLAGS.has(qc)) throw new ClimateCsvError(`Line ${lineNo}: unknown qc_flag "${qc}".`);

    const row = { date, qcFlag: qc as QcFlag, qcFields: cells[12].trim() ? cells[12].trim().split(";") : [] } as ClimateRow;
    NUMERIC_COLUMNS.forEach((col, idx) => {
      row[col] = parseCell(cells[idx + 1], col, lineNo);
    });
    rows.push(row);
  }
  if (rows.length === 0) throw new ClimateCsvError("The file has a header but no data rows.");
  return rows;
}
