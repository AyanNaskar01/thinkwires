import fs from 'fs';
import readline from 'readline';

/**
 * Parses a single SQL tuple string (e.g. "(1, 'Title', NULL, '2026-01-01')")
 * into an array of JavaScript values.
 *
 * @param {string} tupleStr Raw tuple substring
 * @returns {Array<any>} Array of parsed column values
 */
export function parseSqlTuple(tupleStr) {
  const values = [];
  const str = tupleStr.trim();
  // Strip outer parentheses
  const content = str.startsWith('(') && (str.endsWith(')') || str.endsWith('),') || str.endsWith(');'))
    ? str.replace(/^\(/, '').replace(/(\);|\),|\))$/, '')
    : str;

  let currentVal = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (escape) {
      if (char === 'n') currentVal += '\n';
      else if (char === 'r') currentVal += '\r';
      else if (char === 't') currentVal += '\t';
      else currentVal += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      continue;
    }

    if (char === ',' && !inString) {
      values.push(cleanSqlValue(currentVal));
      currentVal = '';
      continue;
    }

    currentVal += char;
  }

  values.push(cleanSqlValue(currentVal));
  return values;
}

/**
 * Normalizes SQL token string to primitive JavaScript types.
 *
 * @param {string} raw
 * @returns {any}
 */
function cleanSqlValue(raw) {
  const trimmed = raw.trim();
  if (trimmed === 'NULL' || trimmed === 'null') {
    return null;
  }
  // Numeric check (integer / float)
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  return trimmed;
}

/**
 * Extracts column names from an INSERT INTO statement header.
 * e.g. "INSERT INTO `careers` (`id`, `title`, ...) VALUES"
 *
 * @param {string} headerLine
 * @returns {{ table: string, columns: Array<string> } | null}
 */
export function parseInsertHeader(headerLine) {
  const match = headerLine.match(/^INSERT INTO `([^`]+)`\s*\(([^)]+)\)\s*VALUES/i);
  if (!match) return null;

  const table = match[1];
  const columns = match[2]
    .split(',')
    .map((col) => col.trim().replace(/^`|`$/g, ''));

  return { table, columns };
}

/**
 * Memory-efficient streaming SQL parser for thinkwir_admin.sql.
 * Parses careers, blogs, career_blogs, founders, and applicants.
 *
 * @param {string} filePath Absolute or relative path to the .sql dump file
 * @param {object} [options]
 * @param {Set<string>} [options.tables] Specific tables to parse (defaults to domain tables)
 * @param {Function} [options.onApplicant] Optional streaming callback for applicant records
 * @returns {Promise<object>} Structured dataset containing parsed domain entities
 */
export async function parseLegacySqlDump(filePath, options = {}) {
  const targetTables = options.tables || new Set([
    'careers',
    'blogs',
    'career_blogs',
    'founders',
    'applicants',
  ]);

  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL dump file not found at: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const result = {
    careers: [],
    blogs: [],
    career_blogs: [],
    founders: [],
    applicants: [],
    totalApplicantRows: 0,
  };

  let currentTable = null;
  let currentColumns = [];
  let multiLineBuffer = '';
  let inMultiLine = false;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) {
      continue;
    }

    const header = parseInsertHeader(trimmed);
    if (header) {
      if (targetTables.has(header.table)) {
        currentTable = header.table;
        currentColumns = header.columns;
      } else {
        currentTable = null;
        currentColumns = [];
      }
      continue;
    }

    if (!currentTable) continue;

    // Line starts a new tuple or continues previous multi-line tuple
    let candidateTuple = trimmed;
    if (inMultiLine) {
      candidateTuple = `${multiLineBuffer}\n${trimmed}`;
    }

    // Check if the tuple is complete (ends with '),' or ');')
    if (candidateTuple.endsWith('),') || candidateTuple.endsWith(');') || candidateTuple.endsWith(')')) {
      inMultiLine = false;
      multiLineBuffer = '';

      const values = parseSqlTuple(candidateTuple);
      const record = {};
      currentColumns.forEach((col, idx) => {
        record[col] = values[idx] !== undefined ? values[idx] : null;
      });

      if (currentTable === 'applicants') {
        result.totalApplicantRows++;
        if (typeof options.onApplicant === 'function') {
          options.onApplicant(record);
        } else {
          result.applicants.push(record);
        }
      } else if (result[currentTable]) {
        result[currentTable].push(record);
      }

      if (candidateTuple.endsWith(');')) {
        currentTable = null;
        currentColumns = [];
      }
    } else {
      // Incomplete multi-line tuple, buffer it
      inMultiLine = true;
      multiLineBuffer = candidateTuple;
    }
  }

  return result;
}

export default {
  parseLegacySqlDump,
  parseSqlTuple,
  parseInsertHeader,
};
