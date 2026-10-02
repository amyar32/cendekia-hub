import { IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import styles from './live-display.module.css';

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className={styles.empty}>
      <IconCheck size={34} stroke={1.8} />
      {children}
    </div>
  );
}
