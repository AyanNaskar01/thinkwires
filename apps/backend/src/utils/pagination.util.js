/**
 * Database Query Pagination & Boundary Utility (SEC-DB-01)
 * Enforces default (50) and hard maximum (100) bounds across all list queries to prevent V8 heap exhaustion.
 */
export const parsePagination = (query = {}, defaultLimit = 50, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10);
  const limit = Math.min(maxLimit, Math.max(1, !isNaN(rawLimit) ? rawLimit : defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export default parsePagination;
