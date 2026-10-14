// Пересобирает раздел «Таблицы» в docs/02-data-model.md из миграций: `npx tsx scripts/gen-data-model.ts`
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'node:fs';
import { migrate } from '../server/db/connection';
const db = new Database(':memory:');
migrate(db);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migration' ORDER BY rowid").pluck().all() as string[];
let out = '';
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; type: string; notnull: number; pk: number }[];
  const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { from: string; table: string }[];
  const uniq = (db.prepare(`PRAGMA index_list(${t})`).all() as { name: string; unique: number; origin: string }[])
    .filter((i) => i.unique && i.origin === 'u')
    .map((i) => (db.prepare(`PRAGMA index_info(${i.name})`).all() as { name: string }[]).map((c) => c.name).join(', '));
  out += `\n#### \`${t}\`\n\n| Поле | Тип | Обяз. | Ссылка |\n|---|---|---|---|\n`;
  for (const c of cols) {
    const fk = fks.find((f) => f.from === c.name);
    out += `| ${c.pk ? '**' + c.name + '** (PK)' : c.name} | ${c.type} | ${c.notnull || c.pk ? 'да' : ''} | ${fk ? '→ ' + fk.table : ''} |\n`;
  }
  if (uniq.length) out += `\nУникальность: ${uniq.map((u) => '(' + u + ')').join('; ')}.\n`;
}
const doc = 'docs/02-data-model.md';
const MARK = '<!-- tables:auto -->';
const head = readFileSync(doc, 'utf8').split(MARK)[0];
writeFileSync(doc, `${head}${MARK}\n${out}`);
console.log(`${doc}: ${tables.length} tables`);
