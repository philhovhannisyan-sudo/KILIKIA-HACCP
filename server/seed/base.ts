// Базовые данные, не являющиеся демо: роли, права, автоматы, нормативные справочники.
// Нормативные данные — строго из docs/regulatory-refs.md (статус СВЕРИТЬ).
import type { DB } from '../db/connection';
import { MODULES } from '../../shared/modules';
import { ROLES, allPermissions, rolePermissions } from '../../shared/permissions';
import { MACHINES } from '../../shared/fsm';
import { insert, L } from './util';

const ROLE_NAMES: Record<string, [string, string, string]> = {
  admin: ['Администратор', 'Administrator', 'Ադմինիստրատոր'],
  haccp_lead: ['Руководитель ХАССП', 'HACCP team leader', 'HACCP խմբի ղեկավար'],
  technologist: ['Технолог / производство', 'Technologist / production', 'Տեխնոլոգ / արտադրություն'],
  operator: ['Оператор линии', 'Line operator', 'Գծի օպերատոր'],
  qa_lab: ['Качество / лаборатория', 'Quality / laboratory', 'Որակ / լաբորատորիա'],
  warehouse: ['Склад', 'Warehouse', 'Պահեստ'],
  tech_director: ['Технический директор', 'Technical director', 'Տեխնիկական տնօրեն'],
  auditor: ['Внешний аудитор', 'External auditor', 'Արտաքին աուդիտոր'],
};

export function seedBase(db: DB): Record<string, string> {
  const codes = MODULES.map((m) => m.code);
  for (const p of allPermissions(codes)) {
    db.prepare('INSERT INTO permission (code, module) VALUES (?, ?)').run(p.code, p.code.split('.')[0]);
  }
  const roleIds: Record<string, string> = {};
  for (const r of ROLES) {
    roleIds[r] = insert(db, 'role', { code: r, name_i18n: L(...ROLE_NAMES[r]) });
    for (const p of rolePermissions(r, codes)) {
      db.prepare('INSERT INTO role_permission (role_id, permission_code) VALUES (?, ?)').run(roleIds[r], p);
    }
  }
  for (const [machine, def] of Object.entries(MACHINES)) {
    def.states.forEach((s, i) =>
      db.prepare('INSERT INTO fsm_state (machine, code, is_initial, is_final, ord) VALUES (?, ?, ?, ?, ?)')
        .run(machine, s, Number(s === def.initial), Number(def.finals.includes(s)), i));
    for (const t of def.transitions) {
      insert(db, 'fsm_transition', {
        machine, from_state: t.from, to_state: t.to, permission: t.permission,
        comment_required: Number(!!t.comment), guards: JSON.stringify(t.guards ?? []),
      });
    }
  }
  seedRegulatory(db);
  return roleIds;
}

function seedRegulatory(db: DB) {
  // regulatory-refs.md §5 «Пункты для расчёта готовности» (СВЕРИТЬ)
  const clauses: [string, string, [string, string, string], string][] = [
    ['ТР ТС 021/2011', 'ст. 10', ['Процедуры на принципах ХАССП', 'HACCP-based procedures', 'HACCP սկզբունքների վրա հիմնված ընթացակարգեր'], 'approved_haccp_plan'],
    ['ISO 22000:2018', '7.5', ['Документированная информация', 'Documented information', 'Փաստաթղթավորված տեղեկատվություն'], 'current_document'],
    ['ISO 22000:2018', '8.2', ['Программы предварительных условий', 'Prerequisite programmes', 'Նախնական պայմանների ծրագրեր'], 'prp_checked_on_time'],
    ['ISO 22000:2018', '8.3', ['Прослеживаемость', 'Traceability', 'Հետագծելիություն'], 'trace_test_12m'],
    ['ISO 22000:2018', '8.5', ['Управление опасностями', 'Hazard control', 'Վտանգների կառավարում'], 'approved_plan_with_hazards'],
    ['ISO 22000:2018', '8.7', ['Мониторинг и измерения', 'Monitoring and measuring', 'Մոնիթորինգ և չափումներ'], 'no_overdue_calibration'],
    ['ISO 22000:2018', '8.8', ['Верификация', 'Verification', 'Ստուգում'], 'verification_30d'],
    ['ISO 22000:2018', '8.9', ['Несоответствия продукции и процессов', 'Product and process nonconformities', 'Արտադրանքի և գործընթացների անհամապատասխանություններ'], 'no_overdue_nc'],
    ['ISO 22000:2018', '9.2', ['Внутренний аудит', 'Internal audit', 'Ներքին աուդիտ'], 'internal_audit_12m'],
    ['ISO 22000:2018', '9.3', ['Анализ со стороны руководства', 'Management review', 'Ղեկավարության կողմից վերլուծություն'], 'management_review_12m'],
    ['ISO 22000:2018', '10.1', ['Несоответствия и корректирующие действия', 'Nonconformity and corrective action', 'Անհամապատասխանություն և ուղղիչ գործողություն'], 'no_overdue_capa'],
  ];
  clauses.forEach(([standard, number, n, rule], ord) =>
    insert(db, 'standard_clause', { standard, number, short_name_i18n: L(...n), rule_code: rule, verify_status: 'СВЕРИТЬ', ord }));

  // regulatory-refs.md §4 — разделы ISO/TS 22002-1 (СВЕРИТЬ), собственные краткие названия
  const sections: [string, [string, string, string]][] = [
    ['4', ['Здания и их конструкция', 'Buildings and construction', 'Շենքեր և դրանց կառուցվածքը']],
    ['5', ['Планировка помещений и рабочих зон', 'Layout of premises and workspace', 'Տարածքների և աշխատանքային գոտիների դասավորություն']],
    ['6', ['Коммунальные системы: вода, воздух, энергия', 'Utilities: water, air, energy', 'Կոմունալ համակարգեր՝ ջուր, օդ, էներգիա']],
    ['7', ['Удаление отходов', 'Waste disposal', 'Թափոնների հեռացում']],
    ['8', ['Оборудование: пригодность, мойка, обслуживание', 'Equipment: suitability, cleaning, maintenance', 'Սարքավորումներ՝ պիտանիություն, լվացում, սպասարկում']],
    ['9', ['Управление закупаемыми материалами', 'Management of purchased materials', 'Գնվող նյութերի կառավարում']],
    ['10', ['Предотвращение перекрёстного загрязнения', 'Prevention of cross-contamination', 'Խաչաձև աղտոտման կանխարգելում']],
    ['11', ['Мойка и санитарная обработка', 'Cleaning and sanitising', 'Լվացում և սանիտարական մշակում']],
    ['12', ['Борьба с вредителями', 'Pest control', 'Վնասատուների դեմ պայքար']],
    ['13', ['Гигиена персонала и бытовые помещения', 'Personnel hygiene and facilities', 'Անձնակազմի հիգիենա և կենցաղային սենքեր']],
    ['14', ['Переработка (повторное использование)', 'Rework', 'Վերամշակում']],
    ['15', ['Отзыв продукции', 'Product recall', 'Արտադրանքի հետկանչ']],
    ['16', ['Хранение', 'Warehousing', 'Պահեստավորում']],
    ['17', ['Информация о продукции для потребителя', 'Product information for consumers', 'Արտադրանքի մասին տեղեկատվություն սպառողի համար']],
    ['18', ['Защита продукции', 'Food defence', 'Արտադրանքի պաշտպանություն']],
  ];
  for (const [number, n] of sections) insert(db, 'prp_section', { number, short_name_i18n: L(...n), verify_status: 'СВЕРИТЬ' });

  // Настройки. Значения DEMO — см. regulatory-refs.md §2, §3 и docs/01-plan.md Р-3, Р-4, Р-17, Р-19
  const settings: [string, unknown, boolean][] = [
    ['trace_target_minutes', 240, true],
    ['recall_target_minutes', 240, true],
    ['event_backdate_hours', 24, true],
    ['event_future_tolerance_minutes', 5, false],
    ['calibration_reminder_days', [30, 15, 7], true],
    ['significance_threshold', 4, true],
    ['verification_window_days', 30, true],
  ];
  for (const [key, value, demo] of settings) {
    db.prepare('INSERT INTO setting (key, value, is_demo) VALUES (?, ?, ?)').run(key, JSON.stringify(value), Number(demo));
  }
}
