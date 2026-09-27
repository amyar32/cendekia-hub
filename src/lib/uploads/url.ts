export function uploadUrl(id: string) {
  return `/api/uploads/${id}`;
}

export function uploadIdFromUrl(url: string) {
  return /^\/api\/uploads\/([0-9a-f-]{36})$/.exec(url)?.[1] ?? null;
}
