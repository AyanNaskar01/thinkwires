/**
 * Database Query Pagination, Cursor Navigation & Boundary Utility
 * 
 * Supports both:
 * 1. Offset-based pagination (page / skip / limit) for backwards compatibility
 * 2. High-performance cursor-based pagination (O(1) index seeks on large collections)
 * 3. Enforced boundary caps (default 50, max 100) to prevent unbounded find() memory exhaustion
 */

/**
 * Encodes cursor metadata into a URL-safe Base64 string.
 *
 * @param {object} cursorData Object containing sortValue and id (e.g. { id, sortValue })
 * @returns {string|null} URL-safe base64 cursor string
 */
export const encodeCursor = (cursorData) => {
  if (!cursorData || !cursorData.id) return null;
  const payload = {
    id: String(cursorData.id),
    sortValue: cursorData.sortValue instanceof Date
      ? cursorData.sortValue.toISOString()
      : cursorData.sortValue,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
};

/**
 * Decodes a URL-safe Base64 cursor string back into its object representation.
 *
 * @param {string} cursorStr Base64 cursor token
 * @returns {object|null} Decoded cursor object { id, sortValue }
 */
export const decodeCursor = (cursorStr) => {
  if (!cursorStr || typeof cursorStr !== 'string') return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Traditional offset-based pagination parser with enforced bounds.
 *
 * @param {object} query Request query object (e.g. req.query)
 * @param {number} defaultLimit Default page size (default: 50)
 * @param {number} maxLimit Hard ceiling page size (default: 100)
 * @returns {{ page: number, limit: number, skip: number }}
 */
export const parsePagination = (query = {}, defaultLimit = 50, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10);
  const limit = Math.min(maxLimit, Math.max(1, !isNaN(rawLimit) ? rawLimit : defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Cursor-based pagination parser with enforced bounds and cursor decoding.
 *
 * @param {object} query Request query object
 * @param {number} defaultLimit Default page size (default: 50)
 * @param {number} maxLimit Hard ceiling page size (default: 100)
 * @returns {{ limit: number, cursor: object|null, rawCursor: string|null }}
 */
export const parseCursorPagination = (query = {}, defaultLimit = 50, maxLimit = 100) => {
  const rawLimit = parseInt(query.limit, 10);
  const limit = Math.min(maxLimit, Math.max(1, !isNaN(rawLimit) ? rawLimit : defaultLimit));
  const rawCursor = typeof query.cursor === 'string' ? query.cursor.trim() : null;
  const cursor = decodeCursor(rawCursor);
  const isCursorMode = Boolean(cursor || (query.cursor !== undefined && query.cursor !== null && query.cursor !== ''));

  return { limit, cursor, rawCursor, isCursorMode };
};

/**
 * Builds an index-friendly MongoDB cursor filter for deterministic pagination.
 * Avoids skip() scanning by seeking directly to documents after/before the cursor.
 *
 * @param {object} baseFilter Existing MongoDB query filter
 * @param {object|null} cursor Decoded cursor { id, sortValue }
 * @param {string} [sortField='createdAt'] Primary sort field
 * @param {number} [sortDirection=-1] 1 for ascending, -1 for descending
 * @returns {object} Filter augmented with cursor seek conditions
 */
export const buildCursorQuery = (
  baseFilter = {},
  cursor = null,
  sortField = 'createdAt',
  sortDirection = -1
) => {
  if (!cursor || cursor.sortValue === undefined) {
    return { ...baseFilter };
  }

  const comparisonOp = sortDirection === -1 ? '$lt' : '$gt';
  const sortVal =
    sortField.toLowerCase().includes('date') || sortField === 'createdAt' || sortField === 'updatedAt'
      ? new Date(cursor.sortValue)
      : cursor.sortValue;

  const cursorCondition = {
    $or: [
      { [sortField]: { [comparisonOp]: sortVal } },
      { [sortField]: sortVal, _id: { [comparisonOp]: cursor.id } },
    ],
  };

  if (Object.keys(baseFilter).length === 0) {
    return cursorCondition;
  }

  return {
    ...baseFilter,
    ...cursorCondition,
  };
};

/**
 * Enforces hard boundary ceilings on any Mongoose query to prevent unbounded find() execution.
 *
 * @param {number} requestedLimit Limit requested by client
 * @param {number} [defaultLimit=50]
 * @param {number} [maxLimit=100]
 * @returns {number} Strictly bounded limit
 */
export const enforceQueryBound = (requestedLimit, defaultLimit = 50, maxLimit = 100) => {
  const parsed = parseInt(requestedLimit, 10);
  if (isNaN(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, maxLimit);
};

export default parsePagination;
