import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../../server/app';

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

export async function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), 'haccp-test-'));
  const app = await buildApp({ dataDir: dir, fresh: true, testMode: true, serveClient: false });
  return {
    app,
    db: () => app.ctx.store.db,
    async close() { await app.close(); rmSync(dir, { recursive: true, force: true }); },
    async login(login: string) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login, password: 'demo' } });
      if (r.statusCode !== 200) throw new Error(`login ${login}: ${r.statusCode} ${r.body}`);
      const cookie = r.cookies.find((c) => c.name === 'haccp_sid')!;
      return `${cookie.name}=${cookie.value}`;
    },
  };
}
