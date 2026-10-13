// Права «модуль.объект.действие» и роли (brief §7). Источник для сида, сервера и UI.
// kind: read — чтение и формирование отчётов; write — любое изменение данных (для К7 у аудитора их нет).
export type PermKind = 'read' | 'write';

const WRITE = [
  // платформа
  'user.account.manage', 'user.role.update', 'settings.value.update',
  'system.backup.export', 'system.backup.import', 'system.demo.reset',
  // ХАССП
  'haccp.plan.edit', 'haccp.plan.submit', 'haccp.plan.approve', 'haccp.plan.revise',
  'ccp.limit.update', 'ccp.monitoring.create', 'ccp.monitoring.correct', 'ccp.monitoring.correct_any',
  'env.record.create', 'env.record.correct', 'env.record.correct_any',
  'prp.program.edit', 'prp.checklist.create',
  'trace.exercise.run',
  // несоответствия и CAPA
  'nc.record.create', 'nc.record.analyze', 'nc.record.transition', 'nc.record.close',
  'capa.action.create', 'capa.action.transition', 'capa.effectiveness.verify',
  // производство и склад
  'batch.fg.create', 'batch.material.receive', 'batch.release.transition', 'batch.record.delete',
  'recipe.bom.edit', 'production.plan.edit', 'shipment.record.create', 'stock.record.move',
  'supplier.record.edit',
  // качество
  'equipment.record.edit', 'equipment.calibration.record', 'lab.sample.create', 'lab.result.approve',
  'document.record.edit', 'document.record.approve', 'audit.internal.edit', 'claim.record.edit',
  'review.record.edit', 'site.record.edit', 'scaffold.record.edit',
] as const;

const READ = ['audit.log.read', 'audit.pack.generate', 'report.custom.generate', 'user.account.read'] as const;

export const MODULE_READ = (code: string) => `${code.toLowerCase()}.module.read`;

export type RoleCode =
  | 'admin' | 'haccp_lead' | 'technologist' | 'operator' | 'qa_lab' | 'warehouse' | 'tech_director' | 'auditor';
export const ROLES: RoleCode[] = ['admin', 'haccp_lead', 'technologist', 'operator', 'qa_lab', 'warehouse', 'tech_director', 'auditor'];

export function allPermissions(moduleCodes: string[]): { code: string; kind: PermKind }[] {
  return [
    ...WRITE.map((code) => ({ code, kind: 'write' as const })),
    ...READ.map((code) => ({ code, kind: 'read' as const })),
    ...moduleCodes.map((c) => ({ code: MODULE_READ(c), kind: 'read' as const })),
  ];
}

export const isWritePermission = (code: string) => (WRITE as readonly string[]).includes(code);

/** Права ролей. Модульное чтение добавляется ниже: всем ролям все модули, кроме «Склад» → A01 (план ХАССП). */
const ROLE_WRITE: Record<RoleCode, string[]> = {
  // «всё», кроме утверждения плана ХАССП — его выполняет только Руководитель ХАССП (brief §5 фаза 3, К13)
  admin: WRITE.filter((p) => p !== 'haccp.plan.approve'),
  haccp_lead: [
    'system.backup.export', 'haccp.plan.edit', 'haccp.plan.submit', 'haccp.plan.approve', 'haccp.plan.revise',
    'ccp.limit.update', 'ccp.monitoring.create', 'ccp.monitoring.correct', 'ccp.monitoring.correct_any',
    'env.record.correct', 'env.record.correct_any', 'prp.program.edit', 'prp.checklist.create', 'trace.exercise.run',
    'nc.record.create', 'nc.record.analyze', 'nc.record.transition', 'nc.record.close',
    'capa.action.create', 'capa.action.transition', 'capa.effectiveness.verify', 'batch.release.transition',
    'document.record.edit', 'document.record.approve', 'audit.internal.edit', 'review.record.edit',
  ],
  technologist: [
    'system.demo.reset', 'batch.fg.create', 'recipe.bom.edit', 'production.plan.edit', 'ccp.monitoring.create',
    'nc.record.create', 'capa.action.transition',
  ],
  operator: ['ccp.monitoring.create', 'ccp.monitoring.correct', 'env.record.create', 'env.record.correct', 'lab.sample.create'],
  qa_lab: [
    'system.demo.reset', 'ccp.monitoring.create', 'ccp.monitoring.correct', 'ccp.monitoring.correct_any',
    'env.record.create', 'env.record.correct', 'env.record.correct_any', 'prp.checklist.create', 'trace.exercise.run',
    'nc.record.create', 'nc.record.analyze', 'nc.record.transition', 'nc.record.close',
    'capa.action.create', 'capa.action.transition', 'capa.effectiveness.verify', 'batch.release.transition',
    'equipment.record.edit', 'equipment.calibration.record', 'lab.sample.create', 'lab.result.approve',
    'document.record.edit', 'audit.internal.edit', 'claim.record.edit', 'supplier.record.edit',
  ],
  warehouse: ['batch.material.receive', 'shipment.record.create', 'stock.record.move', 'env.record.create'],
  tech_director: ['review.record.edit'],
  auditor: [],
};

const ROLE_READ: Record<RoleCode, string[]> = {
  admin: [...READ],
  haccp_lead: ['audit.log.read', 'audit.pack.generate', 'report.custom.generate'],
  technologist: ['report.custom.generate'],
  operator: [],
  qa_lab: ['audit.log.read', 'audit.pack.generate', 'report.custom.generate'],
  warehouse: ['report.custom.generate'],
  tech_director: ['audit.log.read', 'audit.pack.generate', 'report.custom.generate'],
  auditor: ['audit.log.read', 'audit.pack.generate'],
};

export function rolePermissions(role: RoleCode, moduleCodes: string[]): string[] {
  const modules = moduleCodes.filter((c) => !(role === 'warehouse' && c === 'A01')).map(MODULE_READ);
  return [...ROLE_WRITE[role], ...ROLE_READ[role], ...modules];
}
