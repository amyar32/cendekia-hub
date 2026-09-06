import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // The CLI checker loses captured stdout on the supported Node 22 runtime.
  // Use Next's TypeScript compiler API path; `npm run typecheck` still runs tsc directly.
  experimental: { useTypeScriptCli: false },
};
export default config;
