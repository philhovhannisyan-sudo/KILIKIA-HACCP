import { resolve } from 'node:path';
import { buildApp } from './app';

process.env.TZ ??= 'Asia/Yerevan';
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const flag = (name: string, def: boolean) => (process.env[name] === undefined ? def : !['0', 'false', 'no'].includes(process.env[name]!.toLowerCase()));

const app = await buildApp({
  dataDir: resolve(process.env.HACCP_DATA_DIR ?? 'data'),
  fresh: flag('HACCP_FRESH', false),
  demoMode: flag('DEMO_MODE', true),
  testMode: flag('HACCP_TEST_MODE', false),
});
await app.listen({ port, host });
console.log(`HACCP Suite: http://localhost:${port}`);
