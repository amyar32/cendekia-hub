import type { NextConfig } from 'next';
import { resolveAppConfig } from './src/config/app-config';
const app = resolveAppConfig(process.env);
const config: NextConfig = {
  env: { NEXT_PUBLIC_APP_VARIANT: app.id, NEXT_PUBLIC_APP_PPI_NUMBER: app.ppiNumber },
  serverExternalPackages: ['better-sqlite3'],
  // The CLI checker loses captured stdout on the supported Node 22 runtime.
  // Use Next's TypeScript compiler API path; `pnpm run typecheck` still runs tsc directly.
  experimental: { useTypeScriptCli: false },
};
export default config;
