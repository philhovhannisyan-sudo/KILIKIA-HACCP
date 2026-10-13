import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { normalizedDumpHash } from '../../server/backup/dump';
import { verifyChain } from '../../server/core/audit';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('K9 экспорт → сброс → импорт', () => {
  it('K9 хэш нормализованного дампа до и после совпадает; импорт записан в журнал', async () => {
    const admin = await t.login('admin');
    // изменим состояние, чтобы сброс точно отличался от экспорта
    const rec = t.db().prepare('SELECT id FROM monitoring_record WHERE in_limits = 1 LIMIT 1').pluck().get();
    await t.app.inject({ method: 'POST', url: `/api/monitoring/${rec}/corrections`, headers: { cookie: admin }, payload: { value: '86,5', reason: 'Опечатка' } });
    const before = normalizedDumpHash(t.db());

    const exp = await t.app.inject({ method: 'POST', url: '/api/system/export', headers: { cookie: admin } });
    expect(exp.statusCode).toBe(200);
    expect(exp.headers['content-type']).toContain('application/gzip');
    const file = exp.rawPayload;
    expect(JSON.parse(gunzipSync(file).toString()).format).toBe('haccp-suite-state');

    const reset = await t.app.inject({ method: 'POST', url: '/api/system/reset', headers: { cookie: admin } });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(normalizedDumpHash(t.db())).not.toBe(before);
    expect(t.db().prepare('SELECT count(*) FROM monitoring_correction').pluck().get()).toBe(0);

    const imp = await t.app.inject({ method: 'POST', url: '/api/system/import', headers: { cookie: admin, 'content-type': 'application/gzip' }, payload: file });
    expect(imp.statusCode, imp.body).toBe(200);
    expect(normalizedDumpHash(t.db())).toBe(before);
    expect(t.db().prepare("SELECT count(*) FROM audit_log WHERE action = 'system.import'").pluck().get()).toBe(1);
    expect(verifyChain(t.db()).ok).toBe(true);
    // сессия администратора сохранилась
    expect((await t.app.inject({ url: '/api/auth/me', headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it('K9 импорт — только администратор; файл неверного формата отклоняется', async () => {
    const qa = await t.login('qa.lab');
    const r = await t.app.inject({ method: 'POST', url: '/api/system/import', headers: { cookie: qa, 'content-type': 'application/octet-stream' }, payload: Buffer.from('{}') });
    expect(r.statusCode).toBe(403);
    expect(r.json().params.permission).toBe('system.backup.import');
    const admin = await t.login('admin');
    const bad = await t.app.inject({ method: 'POST', url: '/api/system/import', headers: { cookie: admin, 'content-type': 'application/octet-stream' }, payload: Buffer.from('{"format":"x"}') });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('import_invalid_format');
  });

  it('сброс (Р-7): разрешён admin, technologist, qa.lab; цепочка журнала продолжается', async () => {
    for (const login of ['operator', 'warehouse', 'auditor', 'haccp.lead']) {
      const c = await t.login(login);
      expect((await t.app.inject({ method: 'POST', url: '/api/system/reset', headers: { cookie: c } })).statusCode, login).toBe(403);
    }
    const tech = await t.login('technologist');
    const r = await t.app.inject({ method: 'POST', url: '/api/system/reset', headers: { cookie: tech } });
    expect(r.statusCode).toBe(200);
    const first = t.db().prepare('SELECT prev_hash, action FROM audit_log ORDER BY seq LIMIT 1').get() as { prev_hash: string; action: string };
    expect(first.action).toBe('seed');
    expect(first.prev_hash).not.toBe('0'.repeat(64));
    expect(t.db().prepare("SELECT user_name_snapshot FROM audit_log WHERE action = 'system.reset'").pluck().get()).toBe('Давид Акопян');
    expect((await t.app.inject({ url: '/api/auth/me', headers: { cookie: tech } })).statusCode).toBe(200);
  });
});
