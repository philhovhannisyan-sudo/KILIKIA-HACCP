// Конечные автоматы как данные (brief §9). Сид переносит их в таблицы fsm_state / fsm_transition;
// движок (server/core/fsm.ts) читает таблицы, а не этот файл.
export type MachineCode = 'nc' | 'haccp_plan' | 'batch' | 'capa' | 'document';

export interface TransitionDef {
  from: string; to: string; permission: string; comment?: boolean; guards?: string[];
}
export interface MachineDef { states: string[]; initial: string; finals: string[]; transitions: TransitionDef[] }

export const MACHINES: Record<MachineCode, MachineDef> = {
  nc: {
    states: ['registered', 'in_analysis', 'root_cause_identified', 'capa_assigned', 'capa_done', 'effectiveness_check', 'closed'],
    initial: 'registered', finals: ['closed'],
    transitions: [
      { from: 'registered', to: 'in_analysis', permission: 'nc.record.transition' },
      { from: 'in_analysis', to: 'root_cause_identified', permission: 'nc.record.analyze', guards: ['ncRootCauseFilled'] },
      { from: 'root_cause_identified', to: 'capa_assigned', permission: 'nc.record.transition', guards: ['ncHasCapa'] },
      { from: 'capa_assigned', to: 'capa_done', permission: 'nc.record.transition', guards: ['ncAllCapaDone'] },
      { from: 'capa_done', to: 'effectiveness_check', permission: 'nc.record.transition' },
      { from: 'effectiveness_check', to: 'closed', permission: 'nc.record.close', guards: ['ncCapaEffectivenessFilled'] },
      // «Признано нерезультативным»
      { from: 'effectiveness_check', to: 'in_analysis', permission: 'nc.record.close', comment: true },
    ],
  },
  haccp_plan: {
    states: ['draft', 'under_approval', 'approved', 'under_revision', 'archived'],
    initial: 'draft', finals: ['archived'],
    transitions: [
      { from: 'draft', to: 'under_approval', permission: 'haccp.plan.submit', guards: ['planReadyForApproval'] },
      { from: 'under_approval', to: 'approved', permission: 'haccp.plan.approve' },
      { from: 'under_approval', to: 'draft', permission: 'haccp.plan.approve', comment: true },
      { from: 'approved', to: 'under_revision', permission: 'haccp.plan.revise', comment: true },
      { from: 'under_revision', to: 'archived', permission: 'haccp.plan.approve', guards: ['planNewVersionApproved'] },
      { from: 'under_revision', to: 'approved', permission: 'haccp.plan.revise', comment: true },
    ],
  },
  batch: {
    states: ['quarantine', 'checks_done', 'released', 'blocked', 'disposal', 'rework'],
    initial: 'quarantine', finals: ['disposal'],
    transitions: [
      { from: 'quarantine', to: 'checks_done', permission: 'batch.release.transition', guards: ['batchNoOpenNc'] },
      { from: 'checks_done', to: 'released', permission: 'batch.release.transition', guards: ['batchNoOpenNc', 'batchHasConsumption'] },
      { from: 'checks_done', to: 'quarantine', permission: 'batch.release.transition', comment: true },
      { from: 'released', to: 'quarantine', permission: 'batch.release.transition', comment: true },
      { from: 'quarantine', to: 'blocked', permission: 'batch.release.transition', comment: true },
      { from: 'checks_done', to: 'blocked', permission: 'batch.release.transition', comment: true },
      { from: 'released', to: 'blocked', permission: 'batch.release.transition', comment: true },
      { from: 'blocked', to: 'disposal', permission: 'batch.release.transition', comment: true },
      { from: 'blocked', to: 'rework', permission: 'batch.release.transition', comment: true },
      { from: 'rework', to: 'quarantine', permission: 'batch.release.transition' },
    ],
  },
  capa: {
    states: ['planned', 'in_progress', 'done', 'verified', 'closed'],
    initial: 'planned', finals: ['closed'],
    transitions: [
      { from: 'planned', to: 'in_progress', permission: 'capa.action.transition' },
      { from: 'in_progress', to: 'done', permission: 'capa.action.transition' },
      { from: 'done', to: 'verified', permission: 'capa.effectiveness.verify', guards: ['capaEffectivenessFilled'] },
      { from: 'done', to: 'in_progress', permission: 'capa.effectiveness.verify', comment: true },
      { from: 'verified', to: 'closed', permission: 'capa.effectiveness.verify' },
    ],
  },
  document: {
    states: ['draft', 'under_approval', 'current', 'under_revision', 'cancelled'],
    initial: 'draft', finals: ['cancelled'],
    transitions: [
      { from: 'draft', to: 'under_approval', permission: 'document.record.edit' },
      { from: 'under_approval', to: 'current', permission: 'document.record.approve' },
      { from: 'under_approval', to: 'draft', permission: 'document.record.approve', comment: true },
      { from: 'current', to: 'under_revision', permission: 'document.record.edit', comment: true },
      { from: 'under_revision', to: 'current', permission: 'document.record.approve' },
      { from: 'under_revision', to: 'cancelled', permission: 'document.record.approve', comment: true },
    ],
  },
};

/** Сущности, которыми управляют автоматы: машина, таблица, модуль для журнала. */
export const FSM_ENTITIES = {
  nonconformity: { machine: 'nc', table: 'nonconformity', module: 'D04' },
  capa: { machine: 'capa', table: 'capa', module: 'D04' },
  fg_batch: { machine: 'batch', table: 'fg_batch', module: 'C01' },
  material_lot: { machine: 'batch', table: 'material_lot', module: 'C01' },
  haccp_plan: { machine: 'haccp_plan', table: 'haccp_plan', module: 'A01' },
  document: { machine: 'document', table: 'document', module: 'D07' },
} as const satisfies Record<string, { machine: MachineCode; table: string; module: string }>;
export type FsmEntity = keyof typeof FSM_ENTITIES;
