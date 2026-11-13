/**
 * Supabase (PostgREST) returns at most "Max rows" rows per request (1,000 by default)
 * and reports success when it truncates. This helper keeps requesting the next range
 * until an empty page comes back, so no rows are silently dropped, whatever the
 * project's Max rows setting is.
 *
 * `makeQuery` must return a fresh, ORDERED query builder each time it is called
 * (a stable order is what makes range pagination correct).
 */
export const PAGE_SIZE = 1000;

export async function fetchAllRows(makeQuery, pageSize = PAGE_SIZE) {
  const rows = [];
  let from = 0;
  // Safety stop far beyond this study's size (200 participants x 26 answers).
  for (let page = 0; page < 10000; page++) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || String(error));
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
}
