// К26: чистая копия. Клонирует репозиторий во временный каталог, запускает команду из README (`npm start`)
// без каких-либо ручных шагов, ждёт готовности и проверяет вход, страницу и отсутствие внешних адресов в сборке.
// Результат пишет в reports/clean-clone.json (его читает scripts/acceptance-report.mjs).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'haccp-clean-'));
const PORT = 3190;
const base = `http://localhost:${PORT}`;
const tests = [];
const check = (title, fn) => tests.push({ title, fn });
const started = Date.now();
let server;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady() {
  for (let i = 0; i < 600; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* ещё не поднялся */ }
    if (server.exitCode !== null) throw new Error(`npm start завершился с кодом ${server.exitCode}`);
    await sleep(1000);
  }
  throw new Error('сервер не поднялся за 10 минут');
}
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

check('K26 чистая копия: `git clone` → `npm start` поднимает приложение без ручных шагов', async () => {
  const c = spawnSync('git', ['clone', '--quiet', root, dir], { stdio: 'inherit' });
  if (c.status !== 0) throw new Error('git clone не удался');
  // Незакоммиченные правки рабочей копии (без игнорируемых: node_modules, dist, data) — чтобы проверялось текущее состояние
  const files = spawnSync('git', ['ls-files', '-com', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  for (const f of new Set(files)) {
    if (!existsSync(join(root, f))) { rmSync(join(dir, f), { force: true }); continue; }
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
  }
  if (await fetch(`${base}/api/health`).then(() => true, () => false)) throw new Error(`порт ${PORT} занят другим процессом`);
  const env = { ...process.env, PORT: String(PORT) };
  delete env.HACCP_DATA_DIR; delete env.HACCP_FRESH; delete env.HACCP_TEST_MODE;
  server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], { cwd: dir, env, stdio: 'inherit', detached: process.platform !== 'win32' });
  await waitReady();
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'demo' }) });
  if (login.status !== 200) throw new Error(`вход admin: ${login.status}`);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const stats = await (await fetch(`${base}/api/stats`, { headers: { cookie } })).json();
  if (!(Object.values(stats).some((v) => Number(v) > 0))) throw new Error('демо-данные не загружены');
  const page = await fetch(`${base}/m/a01`);
  if (page.status !== 200 || !(await page.text()).includes('<div id="root">')) throw new Error('страница модуля не отдаётся');
});

check('K26 без интернета во время работы: в сборке клиента нет внешних адресов (шрифты и библиотеки локально)', async () => {
  const ext = /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|@import\s+["']https?:\/\/|fetch\(\s*["']https?:\/\//g;
  const bad = walk(join(dir, 'dist')).filter((f) => /\.(html|css|js)$/.test(f)).filter((f) => ext.test(readFileSync(f, 'utf8')));
  if (bad.length) throw new Error(`внешние адреса: ${bad.join(', ')}`);
});

const results = [];
for (const t of tests) {
  const t0 = Date.now();
  try { await t.fn(); results.push({ title: t.title, status: 'passed', duration: Date.now() - t0 }); }
  catch (e) { results.push({ title: t.title, status: 'failed', duration: Date.now() - t0, error: String(e?.message ?? e) }); break; }
}
// npm start порождает сервер дочерним процессом — останавливаем всю группу
if (server) { try { process.kill(process.platform === 'win32' ? server.pid : -server.pid, 'SIGTERM'); } catch { /* уже завершён */ } }
await sleep(1000);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports', 'clean-clone.json'), JSON.stringify({ results, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
for (const r of results) console.log(`${r.status === 'passed' ? '✓' : '✗'} ${r.title} (${r.duration} ms)${r.error ? `\n  ${r.error}` : ''}`);
process.exit(results.length === tests.length && results.every((r) => r.status === 'passed') ? 0 : 1);
