import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../src/lib/pagination';

/** Fake PostgREST query: returns at most `serverCap` rows per request, like Supabase's Max rows. */
function fakeTable(total, serverCap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const requests = [];
  const makeQuery = () => ({
    range(from, to) {
      requests.push([from, to]);
      const end = Math.min(to, from + serverCap - 1);
      return Promise.resolve({ data: rows.slice(from, end + 1), error: null });
    },
  });
  return { makeQuery, requests };
}

describe('fetchAllRows', () => {
  it('returns every row beyond the 1,000-row cap', async () => {
    const { makeQuery } = fakeTable(5200);
    const rows = await fetchAllRows(makeQuery);
    expect(rows).toHaveLength(5200);
    expect(rows[5199].id).toBe(5200);
  });

  it('still returns everything if the project caps pages below the requested size', async () => {
    const { makeQuery } = fakeTable(2600, 500);
    const rows = await fetchAllRows(makeQuery);
    expect(rows).toHaveLength(2600);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2600);
  });

  it('handles an empty table', async () => {
    const { makeQuery } = fakeTable(0);
    expect(await fetchAllRows(makeQuery)).toEqual([]);
  });

  it('throws on a query error instead of returning partial data', async () => {
    let calls = 0;
    const makeQuery = () => ({
      range() {
        calls += 1;
        return Promise.resolve(calls === 1 ? { data: [{ id: 1 }], error: null } : { data: null, error: { message: 'boom' } });
      },
    });
    await expect(fetchAllRows(makeQuery)).rejects.toThrow('boom');
  });
});
