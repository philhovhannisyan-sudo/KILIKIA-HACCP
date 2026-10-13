// `npm test`: типы → линтер → unit (Vitest) → e2e (Playwright) → docs/03-acceptance.md.
// Все шаги выполняются даже при падении предыдущего, чтобы отчёт был полным; код выхода — общий.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const win = process.platform === 'win32';
const steps = [
  ['typecheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']],
  ['lint', 'npx', ['eslint', 'client', 'shared', 'server', 'tests', 'scripts']],
  ['unit', 'npx', ['vitest', 'run']],
  ['e2e', 'npx', ['playwright', 'test']],
  ['acceptance', process.execPath, ['scripts/acceptance-report.mjs']],
];
const failed = [];
for (const [name, cmd, args] of steps) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win });
  if (r.status !== 0) failed.push(name);
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nALL GREEN');
process.exit(failed.length ? 1 : 0);
