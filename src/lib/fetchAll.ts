const PAGE = 1000; // Supabase returns at most 1000 rows per request.

/**
 * Every row of a query, fetched 1000 at a time. `page(from, to)` must build
 * the query with a stable order and `.range(from, to)`.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return null;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}
