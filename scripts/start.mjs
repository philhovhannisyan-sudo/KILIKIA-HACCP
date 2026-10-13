// Одна команда запуска (README): `npm start`.
// На чистой копии: установка зависимостей → сборка клиента → запуск сервера.
// Использует только встроенные модули Node, поэтому работает до `npm ci`.
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`Нужен Node.js 22 или новее, установлен ${process.versions.node}`);
  process.exit(1);
}

if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) {
  console.log('Установка зависимостей (нужен интернет только на этом шаге)…');
  run(npm, ['ci', '--no-audit', '--no-fund']);
}

const newest = (dir) => {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
};
const distIndex = join(root, 'dist', 'index.html');
const srcTime = Math.max(newest(join(root, 'client')), newest(join(root, 'shared')), statSync(join(root, 'docs', 'glossary.csv')).mtimeMs);
if (!existsSync(distIndex) || statSync(distIndex).mtimeMs < srcTime) {
  console.log('Сборка клиента…');
  run(npm, ['run', 'build']);
}

const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, stdio: 'inherit' });
const stop = () => child.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
