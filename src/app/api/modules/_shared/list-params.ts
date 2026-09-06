export function listParams(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').slice(0, 100);
  const page = Math.max(1, Math.min(100_000, Number(url.searchParams.get('page')) || 1));

  return {
    filter: `%${query}%`,
    offset: (Math.floor(page) - 1) * 10,
  };
}
