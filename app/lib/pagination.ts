export const PAGE_SIZE = 50;

export const PAGE_PARAM = "page";

export interface PageInfo {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

export function pageCount(total: number, size: number = PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.ceil(total / size);
}

export function parsePage(params: URLSearchParams): number {
  const raw = Number(params.get(PAGE_PARAM));
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  size: number = PAGE_SIZE,
): { items: T[]; info: PageInfo } {
  const total = items.length;
  const count = pageCount(total, size);
  const current = Math.min(Math.max(Math.trunc(page), 1), count);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);

  return {
    items: slice,
    info: {
      page: current,
      pageCount: count,
      from: total === 0 ? 0 : start + 1,
      to: start + slice.length,
      total,
    },
  };
}

export function pageHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete(PAGE_PARAM);
  else next.set(PAGE_PARAM, String(page));
  return `?${next.toString()}`;
}
