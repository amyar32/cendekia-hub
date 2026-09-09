'use client';

import { useEffect } from 'react';

/** Print control that waits for all card assets to load before opening the print dialog. */
export function CardPrintTrigger() {
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const images = Array.from(document.images);
    void Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) return resolve();
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    ).then(() => {
      if (!cancelled) timer = window.setTimeout(() => window.print(), 150);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <button type="button" onClick={() => window.print()}>
      Cetak kartu
    </button>
  );
}
