import type { IdentityCardOrientation } from './identity-card';

export function CardPrintPageStyle({ orientation }: { orientation: IdentityCardOrientation }) {
  const width = orientation === 'portrait' ? 55 : 90;
  const height = orientation === 'portrait' ? 90 : 55;

  return (
    <style>{`@page { size: ${width}mm ${height}mm; margin: 0; }
      @media print {
        html, body {
          width: ${width}mm;
          height: ${height}mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      }`}</style>
  );
}
