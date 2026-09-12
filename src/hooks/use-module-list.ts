'use client';

import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';

export type ModuleListResponse<Row> = {
  rows: Row[];
  total: number;
  roles?: { id: string; name: string }[];
  options?: Record<
    string,
    {
      value: string;
      label: string;
      disabled?: boolean;
      is_required?: number | boolean;
      name?: string;
      email?: string;
    }[]
  >;
  selected?: Record<string, string>;
  has_active_year?: boolean;
  periods?: unknown[];
};

export function useModuleList<Row>(endpoint: string, params: Record<string, string> = {}) {
  const serializedParams = JSON.stringify(params);
  const [data, setData] = useState<ModuleListResponse<Row>>({ rows: [], total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const extraParams = JSON.parse(serializedParams) as Record<string, string>;
    const searchParams = new URLSearchParams({ page: String(page), q: search, ...extraParams });
    fetch(`${endpoint}?${searchParams}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result as ModuleListResponse<Row>;
      })
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        const message = cause instanceof Error ? cause.message : 'Koneksi gagal.';
        setError(message);
        notifications.show({ title: 'Data gagal dimuat', message, color: 'red' });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [endpoint, page, search, revision, serializedParams]);

  return {
    ...data,
    page,
    setPage,
    query,
    setQuery,
    search,
    loading,
    error,
    reload,
  };
}

export async function moduleMutation(endpoint: string, method: string, body: unknown) {
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result as {
    ok: true;
    id: string;
    created?: number;
    skipped?: number;
    account_email?: string;
    temporary_password?: string;
  };
}
