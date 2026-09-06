import { Alert } from '@mantine/core';

export function AccessDenied({ dashboard = false }: { dashboard?: boolean }) {
  return (
    <Alert
      color={dashboard ? 'orange' : 'red'}
      title={dashboard ? 'Akses terbatas' : 'Akses ditolak'}
    >
      {dashboard
        ? 'Role Anda tidak memiliki akses ringkasan. Pilih modul yang tersedia di navigasi.'
        : 'Anda tidak memiliki izin untuk membuka modul ini.'}
    </Alert>
  );
}
