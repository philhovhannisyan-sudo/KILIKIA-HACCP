// DEMO — заменить реальными данными предприятия.
// Все значения этого модуля — демонстрационные (brief §12). Даты считаются от дня сидинга (Asia/Yerevan),
// чтобы просроченная CAPA, истёкшая поверка P-01 и 14 дней записей среды оставались верными в любой день запуска.
import type { DB } from '../db/connection';
import { addDays } from '../../shared/time';
import { hashPassword } from '../core/password';
import { insert, L, prng, yerevan } from './util';

export function seedDemo(db: DB, today: string, roleIds: Record<string, string>) {
  const d = (n: number) => addDays(today, n);
  const rnd = prng(20261013);

  // ── Площадка ── // DEMO
  const siteId = insert(db, 'site', { code: 'DEMO-01', name_i18n: L('DEMO-завод фруктовых консервов', 'DEMO fruit preserves plant', 'DEMO մրգային պահածոների գործարան'), active: 1 });

  // ── Пользователи: пароль «demo» у всех ── // DEMO
  const users: Record<string, string> = {};
  const passwordHash = hashPassword('demo');
  const userDefs: [string, string, string[]][] = [
    ['admin', 'Арам Саргсян', ['admin']],
    ['haccp.lead', 'Анна Петросян', ['haccp_lead']],
    ['technologist', 'Давид Акопян', ['technologist']],
    ['operator', 'Карен Мкртчян', ['operator']],
    ['qa.lab', 'Лилит Аветисян', ['qa_lab']],
    ['warehouse', 'Тигран Оганесян', ['warehouse']],
    ['tech.director', 'Сюзанна Карапетян', ['tech_director']],
    ['auditor', 'Ирина Волкова', ['auditor']],
    ['qa.tech', 'Нарек Григорян', ['qa_lab', 'technologist']],
  ];
  for (const [login, fullName, roles] of userDefs) {
    users[login] = insert(db, 'user', { id: `U-${login}`, login, full_name: fullName, password_hash: passwordHash, active: 1, site_id: siteId });
    for (const r of roles) db.prepare('INSERT INTO user_role (user_id, role_id) VALUES (?, ?)').run(users[login], roleIds[r]);
  }

  // ── Справочники ── // DEMO
  const line = insert(db, 'production_line', { code: 'L1', name_i18n: L('Линия фасовки №1', 'Filling line No. 1', 'Լցման գիծ №1') });
  const whRm = insert(db, 'warehouse', { code: 'WH-RM', name_i18n: L('Склад сырья и упаковки', 'Raw material and packaging warehouse', 'Հումքի և փաթեթավորման պահեստ') });
  const whFg = insert(db, 'warehouse', { code: 'WH-FG', name_i18n: L('Склад готовой продукции', 'Finished goods warehouse', 'Պատրաստի արտադրանքի պահեստ') });

  const mat = (code: string, kind: 'raw' | 'packaging', unit: string, n: [string, string, string]) =>
    insert(db, 'material', { code, kind, unit, name_i18n: L(...n) });
  const M = {
    apricot: mat('RM-APR', 'raw', 'kg', ['Абрикос', 'Apricot', 'Ծիրան']),
    cherry: mat('RM-CHR', 'raw', 'kg', ['Вишня', 'Sour cherry', 'Բալ']),
    strawberry: mat('RM-STR', 'raw', 'kg', ['Клубника', 'Strawberry', 'Ելակ']),
    sugar: mat('RM-SUG', 'raw', 'kg', ['Сахар', 'Sugar', 'Շաքար']),
    pectin: mat('RM-PEC', 'raw', 'kg', ['Пектин', 'Pectin', 'Պեկտին']),
    citric: mat('RM-CIT', 'raw', 'kg', ['Лимонная кислота', 'Citric acid', 'Կիտրոնաթթու']),
    jar: mat('PK-JAR', 'packaging', 'pcs', ['Стеклобанка', 'Glass jar', 'Ապակե տարա']),
    lid: mat('PK-LID', 'packaging', 'pcs', ['Крышка twist-off', 'Twist-off lid', 'Twist-off կափարիչ']),
  };

  const sup = (code: string, name: string, rating: number, status: string) =>
    insert(db, 'supplier', { code, name, rating, approval_status: status });
  const S = {
    orchard: sup('SUP-01', 'DEMO «Араратские сады»', 4.6, 'approved'),
    sugar: sup('SUP-02', 'DEMO «Сахарный комбинат»', 4.2, 'approved'),
    additives: sup('SUP-03', 'DEMO «Пищевые добавки»', 3.9, 'approved'),
    glass: sup('SUP-04', 'DEMO «Стеклотара»', 3.4, 'conditional'),
  };
  insert(db, 'supplier_document', { supplier_id: S.orchard, type: 'CoA', valid_to: d(200) });
  insert(db, 'supplier_document', { supplier_id: S.sugar, type: 'ISO 22000', valid_to: d(400) });
  insert(db, 'supplier_document', { supplier_id: S.additives, type: 'halal', valid_to: d(25) });
  insert(db, 'supplier_document', { supplier_id: S.glass, type: 'CoA', valid_to: d(-10) });

  const cust = (code: string, name: string, address: string) => insert(db, 'customer', { code, name, address });
  const C = [
    cust('CUS-01', 'DEMO Супермаркет «Ереван Сити»', 'Ереван'),
    cust('CUS-02', 'DEMO Торговая сеть «Сас»', 'Ереван'),
    cust('CUS-03', 'DEMO Дистрибьютор «Ширак»', 'Гюмри'),
    cust('CUS-04', 'DEMO HoReCa «Севан»', 'Севан'),
    cust('CUS-05', 'DEMO Экспорт «Тбилиси»', 'Тбилиси'),
  ];

  const product = (code: string, n: [string, string, string], grams: number) =>
    insert(db, 'product', {
      code, name_i18n: L(...n), shelf_life_days: 730,
      spec_i18n: L('Сухие вещества ≥ 60 %, pH ≤ 3,6', 'Soluble solids ≥ 60 %, pH ≤ 3.6', 'Չոր նյութեր ≥ 60 %, pH ≤ 3,6'),
      packaging_i18n: L(`Стеклобанка ${grams} г, крышка twist-off`, `Glass jar ${grams} g, twist-off lid`, `Ապակե տարա ${grams} գ, twist-off կափարիչ`),
      nutrition: JSON.stringify({ kcal: 250, carbs_g: 62, sugars_g: 58, protein_g: 0.4, fat_g: 0.1 }),
    });
  const P = {
    apr: { id: product('FG-APR-370', ['Джем абрикосовый 370 г', 'Apricot jam 370 g', 'Ծիրանի ջեմ 370 գ'], 370), fruit: M.apricot, kg: 0.37, prefix: 'APR' },
    chr: { id: product('FG-CHR-450', ['Варенье вишнёвое 450 г', 'Sour cherry preserve 450 g', 'Բալի մուրաբա 450 գ'], 450), fruit: M.cherry, kg: 0.45, prefix: 'CHR' },
    str: { id: product('FG-STR-320', ['Конфитюр клубничный 320 г', 'Strawberry confiture 320 g', 'Ելակի կոնֆիտյուր 320 գ'], 320), fruit: M.strawberry, kg: 0.32, prefix: 'STR' },
  };
  const recipes: Record<string, string> = {};
  for (const p of Object.values(P)) {
    recipes[p.prefix] = insert(db, 'recipe', { product_id: p.id, version: 1, valid_from: d(-365), status: 'current' });
    const lines: [string, number, string][] = [
      [p.fruit, +(p.kg * 0.55).toFixed(3), 'kg'], [M.sugar, +(p.kg * 0.45).toFixed(3), 'kg'],
      [M.pectin, 0.002, 'kg'], [M.citric, 0.001, 'kg'], [M.jar, 1, 'pcs'], [M.lid, 1, 'pcs'],
    ];
    for (const [material_id, qty_per_unit, unit] of lines) insert(db, 'recipe_line', { recipe_id: recipes[p.prefix], material_id, qty_per_unit, unit });
  }

  // ── Партии сырья и упаковки (12) ── // DEMO
  const lotDefs: [string, string, string, number, number, number, string][] = [
    // code, material, supplier, received (дн.), срок (дн. от приёмки), qty, unit
    ['RL-APR-01', M.apricot, S.orchard, -45, 20, 1500, 'kg'],
    ['RL-APR-02', M.apricot, S.orchard, -12, 20, 1200, 'kg'],
    ['RL-CHR-01', M.cherry, S.orchard, -40, 15, 1400, 'kg'],
    ['RL-CHR-02', M.cherry, S.orchard, -10, 15, 1100, 'kg'],
    ['RL-STR-01', M.strawberry, S.orchard, -35, 10, 1000, 'kg'],
    ['RL-STR-02', M.strawberry, S.orchard, -6, 10, 900, 'kg'],
    ['RL-SUG-01', M.sugar, S.sugar, -60, 720, 8000, 'kg'],
    ['RL-SUG-02', M.sugar, S.sugar, -15, 720, 5000, 'kg'],
    ['RL-PEC-01', M.pectin, S.additives, -90, 540, 120, 'kg'],
    ['RL-CIT-01', M.citric, S.additives, -90, 720, 80, 'kg'],
    ['RL-JAR-01', M.jar, S.glass, -50, 3650, 60000, 'pcs'],
    ['RL-LID-01', M.lid, S.glass, -50, 1825, 60000, 'pcs'],
  ];
  const lots: Record<string, { id: string; qty: number; used: number }> = {};
  for (const [code, material_id, supplier_id, rec, life, qty, unit] of lotDefs) {
    const id = insert(db, 'material_lot', {
      code, material_id, supplier_id, received_date: d(rec), expiry_date: d(rec + life), qty, unit, status: 'released',
    });
    lots[code] = { id, qty, used: 0 };
  }

  // ── Партии готовой продукции (12) и расход сырья ── // DEMO
  const batchDefs: [keyof typeof P, number, string, number, string, string][] = [
    // продукт, день, смена, кол-во, партия фрукта, партия сахара
    ['apr', -30, 'A', 2000, 'RL-APR-01', 'RL-SUG-01'], ['chr', -28, 'B', 1800, 'RL-CHR-01', 'RL-SUG-01'],
    ['str', -26, 'A', 1600, 'RL-STR-01', 'RL-SUG-01'], ['apr', -22, 'B', 2200, 'RL-APR-01', 'RL-SUG-01'],
    ['chr', -19, 'A', 1700, 'RL-CHR-01', 'RL-SUG-01'], ['str', -16, 'B', 1500, 'RL-STR-01', 'RL-SUG-01'],
    ['apr', -11, 'A', 2100, 'RL-APR-02', 'RL-SUG-02'], ['chr', -8, 'B', 1900, 'RL-CHR-02', 'RL-SUG-02'],
    ['apr', -5, 'A', 2000, 'RL-APR-02', 'RL-SUG-02'], ['chr', -4, 'B', 1800, 'RL-CHR-02', 'RL-SUG-02'],
    ['str', -3, 'A', 1400, 'RL-STR-02', 'RL-SUG-02'], ['str', -2, 'B', 1500, 'RL-STR-02', 'RL-SUG-02'],
  ];
  const counters: Record<string, number> = { APR: 0, CHR: 0, STR: 0 };
  const batches: { id: string; code: string; product: keyof typeof P; day: number; qty: number; shipped: number; status: string }[] = [];
  batchDefs.forEach(([pk, day, shift, qty, fruitLot, sugarLot], i) => {
    const p = P[pk];
    const code = `B-${p.prefix}-${String(++counters[p.prefix]).padStart(2, '0')}`;
    const status = i === batchDefs.length - 1 ? 'quarantine' : 'released'; // последняя — на карантине (НС-001)
    const id = insert(db, 'fg_batch', {
      code, product_id: p.id, recipe_id: recipes[p.prefix], produced_date: d(day), line_id: line, shift, qty, status,
    });
    const use = (lot: string, amount: number) => {
      insert(db, 'batch_consumption', { fg_batch_id: id, material_lot_id: lots[lot].id, qty: +amount.toFixed(3) });
      lots[lot].used += amount;
    };
    use(fruitLot, qty * p.kg * 0.55); use(sugarLot, qty * p.kg * 0.45);
    use('RL-PEC-01', qty * 0.002); use('RL-CIT-01', qty * 0.001); use('RL-JAR-01', qty); use('RL-LID-01', qty);
    batches.push({ id, code, product: pk, day, qty, shipped: 0, status });
  });
  const B = (code: string) => batches.find((b) => b.code === code)!;

  // ── Отгрузки (9), FEFO соблюдён ── // DEMO
  const shipDefs: [number, number, [string, number][]][] = [
    [-25, 0, [['B-APR-01', 800]]], [-21, 1, [['B-CHR-01', 900], ['B-APR-01', 400]]],
    [-18, 2, [['B-STR-01', 700]]], [-15, 3, [['B-APR-01', 600], ['B-CHR-01', 500]]],
    [-12, 4, [['B-STR-01', 600], ['B-APR-02', 500]]], [-9, 0, [['B-CHR-02', 800]]],
    [-6, 1, [['B-APR-02', 900], ['B-STR-02', 500]]], [-3, 2, [['B-CHR-02', 600], ['B-APR-03', 700]]],
    [-1, 3, [['B-STR-02', 600], ['B-CHR-03', 400]]],
  ];
  shipDefs.forEach(([day, c, lines], i) => {
    const sid = insert(db, 'shipment', {
      number: `SH-${String(i + 1).padStart(3, '0')}`, customer_id: C[c], shipped_date: d(day),
      transport_temp_min: 8 + Math.round(rnd() * 4), transport_temp_max: 18 + Math.round(rnd() * 5),
    });
    for (const [code, qty] of lines) {
      insert(db, 'shipment_line', { shipment_id: sid, fg_batch_id: B(code).id, qty });
      B(code).shipped += qty;
    }
  });

  // ── Остатки на складах ── // DEMO
  for (const l of Object.values(lots)) {
    insert(db, 'stock', { warehouse_id: whRm, lot_kind: 'material', lot_id: l.id, qty: +(l.qty - l.used).toFixed(3) });
  }
  for (const b of batches) insert(db, 'stock', { warehouse_id: whFg, lot_kind: 'fg', lot_id: b.id, qty: b.qty - b.shipped });

  // ── Оборудование: P-01 с истёкшей поверкой ── // DEMO
  const eq = (code: string, n: [string, string, string], zone: [string, string, string], kind: string, last: number, next: number) =>
    insert(db, 'equipment', {
      code, name_i18n: L(...n), zone_i18n: L(...zone), kind, last_cal_date: d(last), next_cal_date: d(next),
      status: next < 0 ? 'calibration_overdue' : 'in_service', certificate: `CERT-${code}-${d(last).slice(0, 4)}`,
    });
  const filling: [string, string, string] = ['Цех фасовки', 'Filling area', 'Լցման արտադրամաս'];
  const cooking: [string, string, string] = ['Варочный участок', 'Cooking area', 'Եփման տեղամաս'];
  const E = {
    t01: eq('T-01', ['Термометр T-01', 'Thermometer T-01', 'Ջերմաչափ T-01'], filling, 'thermometer', -245, 120),
    md01: eq('MD-01', ['Металлодетектор MD-01', 'Metal detector MD-01', 'Մետաղադետեկտոր MD-01'], filling, 'metal_detector', -305, 60),
    r01: eq('R-01', ['Рефрактометр R-01', 'Refractometer R-01', 'Ռեֆրակտոմետր R-01'], cooking, 'refractometer', -345, 20),
    p01: eq('P-01', ['pH-метр P-01', 'pH meter P-01', 'pH-չափիչ P-01'], cooking, 'ph_meter', -371, -6),
    th01: eq('TH-01', ['Термогигрометр TH-01', 'Thermo-hygrometer TH-01', 'Ջերմախոնավաչափ TH-01'], ['Камера сырья', 'Raw material chamber', 'Հումքի խցիկ'], 'thermo_hygrometer', -165, 200),
    th02: eq('TH-02', ['Термогигрометр TH-02', 'Thermo-hygrometer TH-02', 'Ջերմախոնավաչափ TH-02'], ['Склад ГП', 'Finished goods store', 'ՊԱ պահեստ'], 'thermo_hygrometer', -165, 200),
    th03: eq('TH-03', ['Термогигрометр TH-03', 'Thermo-hygrometer TH-03', 'Ջերմախոնավաչափ TH-03'], filling, 'thermo_hygrometer', -165, 200),
  };

  // ── План ХАССП v1 (утверждён) ── // DEMO
  const lineage = 'PLAN-JAM';
  const planId = insert(db, 'haccp_plan', {
    lineage_id: lineage, version: 1, status: 'approved',
    title_i18n: L('План ХАССП: джемы, варенье, конфитюры', 'HACCP plan: jams, preserves, confitures', 'HACCP պլան՝ ջեմեր, մուրաբաներ, կոնֆիտյուրներ'),
    scope: JSON.stringify([P.apr.id, P.chr.id, P.str.id]),
    wizard_state: JSON.stringify({
      intendedUse: L('Готовый к употреблению продукт для всех групп потребителей; хранение при температуре до 25 °C', 'Ready-to-eat product for all consumer groups; storage up to 25 °C', 'Օգտագործման պատրաստ արտադրանք սպառողների բոլոր խմբերի համար՝ պահպանում մինչև 25 °C'),
      verification: L('Ежемесячный анализ записей ККТ, ежегодная валидация пределов', 'Monthly review of CCP records, annual validation of limits', 'ՀԿԿ գրառումների ամսական վերլուծություն, սահմանների տարեկան վավերացում'),
    }),
    site_verified_date: d(-62), site_verified_by: 'Анна Петросян', approved_at: yerevan(d(-60), '11:00'),
    approved_by: users['haccp.lead'], effective_from: d(-60), created_at: yerevan(d(-75), '09:00'),
  });
  for (const [name, role, competence] of [
    ['Анна Петросян', 'Руководитель группы ХАССП', 'Обучение ХАССП, 8 лет'],
    ['Давид Акопян', 'Технолог', 'Технология консервирования'],
    ['Лилит Аветисян', 'Инженер по качеству', 'Микробиология'],
    ['Арам Саргсян', 'Инженер-механик', 'Обслуживание оборудования'],
  ]) insert(db, 'haccp_team_member', { plan_id: planId, name, role, competence });

  const stepNames: [string, string, string][] = [
    ['Приёмка сырья', 'Raw material receiving', 'Հումքի ընդունում'],
    ['Мойка и инспекция', 'Washing and inspection', 'Լվացում և զննում'],
    ['Подготовка фруктов', 'Fruit preparation', 'Մրգերի նախապատրաստում'],
    ['Варка', 'Cooking', 'Եփում'],
    ['Стерилизация тары', 'Container sterilisation', 'Տարայի ստերիլիզացում'],
    ['Фасовка (горячий розлив)', 'Filling (hot fill)', 'Լցում (տաք լցում)'],
    ['Укупорка', 'Capping', 'Կափարում'],
    ['Охлаждение', 'Cooling', 'Սառեցում'],
    ['Обнаружение металла', 'Metal detection', 'Մետաղի հայտնաբերում'],
    ['Маркировка', 'Labelling', 'Պիտակավորում'],
    ['Хранение', 'Storage', 'Պահպանում'],
  ];
  const steps = stepNames.map((n, ord) => insert(db, 'process_step', { plan_id: planId, ord, name_i18n: L(...n) }));

  const hazard = (step: number, type: string, desc: [string, string, string], likelihood: number, severity: number,
    measure: [string, string, string], result: string, answers: [string, 'yes' | 'no', string][]) => {
    const id = insert(db, 'hazard', {
      plan_id: planId, step_id: steps[step], type, description_i18n: L(...desc), likelihood, severity,
      significant: Number(likelihood * severity >= 4 || severity === 3), control_measure_i18n: L(...measure), result,
    });
    answers.forEach(([node, answer, justification], ord) => insert(db, 'hazard_decision', { hazard_id: id, node, answer, justification, ord }));
    return id;
  };
  hazard(0, 'chem', ['Остатки пестицидов в фруктах', 'Pesticide residues in fruit', 'Թունաքիմիկատների մնացորդներ մրգերում'], 1, 2,
    ['Одобрение поставщиков, CoA на партию', 'Supplier approval, CoA per lot', 'Մատակարարների հաստատում, CoA յուրաքանչյուր խմբաքանակի համար'], 'PRP', []);
  const hOprp = hazard(3, 'bio', ['Рост микроорганизмов при недостаточной концентрации сухих веществ и кислотности', 'Microbial growth due to insufficient soluble solids and acidity', 'Միկրոօրգանիզմների աճ՝ չոր նյութերի և թթվայնության անբավարարության պատճառով'], 2, 2,
    ['Контроль Brix и pH на каждой варке', 'Brix and pH check for each cook', 'Brix-ի և pH-ի ստուգում յուրաքանչյուր եփման ժամանակ'], 'OPRP', [
      ['Q1', 'yes', 'Контроль Brix и pH при варке'], ['Q2', 'no', 'Варка не предназначена специально для устранения опасности'],
      ['Q3', 'yes', 'При нарушении рецептуры возможен рост дрожжей и плесени'], ['Q4', 'yes', 'Горячий розлив (ККТ-1) снижает опасность'],
    ]);
  insert(db, 'oprp_assessment', {
    hazard_id: hOprp, result: 'OPRP', justification: 'Brix и pH — критерии действия, а не критические пределы',
    criteria: JSON.stringify({
      1: { answer: 'yes', justification: 'Возможна ошибка дозирования сахара' }, 2: { answer: 'yes', justification: 'Порча продукта в обращении' },
      3: { answer: 'yes', justification: 'Мера снижает вероятность роста' }, 4: { answer: 'no', justification: 'Не влияет на другие меры' },
      5: { answer: 'no', justification: 'Пределы — критерии действия, а не критические пределы' },
    }),
  });
  const hCcp1 = hazard(5, 'bio', ['Выживание микроорганизмов в таре при недостаточной температуре розлива', 'Survival of microorganisms in containers at insufficient filling temperature', 'Միկրոօրգանիզմների գոյատևում տարայում լցման անբավարար ջերմաստիճանի դեպքում'], 2, 3,
    ['Горячий розлив при T ≥ 85 °C', 'Hot fill at T ≥ 85 °C', 'Տաք լցում T ≥ 85 °C-ում'], 'CCP', [
      ['Q1', 'yes', 'Температура розлива контролируется'], ['Q2', 'yes', 'Стадия предназначена для снижения опасности'],
    ]);
  const hCcp2 = hazard(8, 'phys', ['Металлические включения', 'Metal fragments', 'Մետաղական ներառումներ'], 2, 3,
    ['Металлодетектор с отбраковкой', 'Metal detector with reject', 'Մետաղադետեկտոր՝ խոտանումով'], 'CCP', [
      ['Q1', 'yes', 'Есть металлодетектор'], ['Q2', 'yes', 'Стадия предназначена для устранения металла'],
    ]);
  hazard(4, 'phys', ['Осколки стекла', 'Glass fragments', 'Ապակու բեկորներ'], 1, 2,
    ['Инспекция тары, программа контроля стекла', 'Container inspection, glass control programme', 'Տարայի զննում, ապակու հսկման ծրագիր'], 'PRP', []);

  // ── ККТ / OPRP и параметры ── // DEMO
  const cp = (code: string, type: string, step: number, hz: string, n: [string, string, string], ca: [string, string, string]) =>
    insert(db, 'control_point', {
      code, type, plan_lineage_id: lineage, hazard_id: hz, step_id: steps[step], name_i18n: L(...n),
      responsible_role: 'operator', corrective_action_i18n: L(...ca), active: 1,
    });
  const param = (cpId: string, code: string, n: [string, string, string], kind: string, min: number | null, max: number | null,
    unit: string | null, method: [string, string, string], freq: [string, string, string], equipment: string) =>
    insert(db, 'control_parameter', {
      control_point_id: cpId, code, name_i18n: L(...n), kind, limit_min: min, limit_max: max, unit,
      method_i18n: L(...method), frequency_i18n: L(...freq), equipment_id: equipment,
    });
  const ccp1 = cp('CCP-1', 'CCP', 5, hCcp1, ['Горячий розлив', 'Hot fill', 'Տաք լցում'],
    ['Остановить розлив, партию — на карантин, догреть продукт, оценить безопасность партии', 'Stop filling, quarantine the batch, reheat the product, assess batch safety', 'Դադարեցնել լցումը, խմբաքանակը՝ կարանտին, տաքացնել արտադրանքը, գնահատել խմբաքանակի անվտանգությունը']);
  const pT = param(ccp1, 'T', ['Температура продукта при фасовке', 'Product temperature at filling', 'Արտադրանքի ջերմաստիճանը լցման ժամանակ'], 'numeric', 85, null, '°C',
    ['Термометр в потоке продукта', 'Thermometer in product flow', 'Ջերմաչափ արտադրանքի հոսքում'], ['Каждая партия / каждые 30 мин', 'Each batch / every 30 min', 'Յուրաքանչյուր խմբաքանակ / 30 րոպեն մեկ'], E.t01);
  const ccp2 = cp('CCP-2', 'CCP', 8, hCcp2, ['Обнаружение металла', 'Metal detection', 'Մետաղի հայտնաբերում'],
    ['Остановить линию, проверить продукцию с последней успешной проверки, настроить детектор', 'Stop the line, re-check product since last successful check, adjust detector', 'Կանգնեցնել գիծը, վերստուգել արտադրանքը վերջին հաջող ստուգումից ի վեր, կարգաբերել դետեկտորը']);
  const freq60: [string, string, string] = ['Каждые 60 мин', 'Every 60 min', '60 րոպեն մեկ'];
  const mdMethod: [string, string, string] = ['Прогон эталона через детектор', 'Test piece passed through detector', 'Էտալոնի անցկացում դետեկտորով'];
  const pFe = param(ccp2, 'FE', ['Эталон Fe 2,0 мм', 'Test piece Fe 2.0 mm', 'Էտալոն Fe 2,0 մմ'], 'pass_fail', null, null, null, mdMethod, freq60, E.md01);
  const pNfe = param(ccp2, 'NFE', ['Эталон non-Fe 2,5 мм', 'Test piece non-Fe 2.5 mm', 'Էտալոն non-Fe 2,5 մմ'], 'pass_fail', null, null, null, mdMethod, freq60, E.md01);
  const pSs = param(ccp2, 'SS', ['Эталон SS 3,0 мм', 'Test piece SS 3.0 mm', 'Էտալոն SS 3,0 մմ'], 'pass_fail', null, null, null, mdMethod, freq60, E.md01);
  const oprp1 = cp('OPRP-1', 'OPRP', 3, hOprp, ['Сухие вещества и pH', 'Soluble solids and pH', 'Չոր նյութեր և pH'],
    ['Скорректировать рецептуру варки (сахар, кислота), повторить измерение', 'Adjust cooking recipe (sugar, acid), repeat measurement', 'Ճշգրտել եփման բաղադրատոմսը (շաքար, թթու), կրկնել չափումը']);
  const pBrix = param(oprp1, 'BRIX', ['Сухие вещества', 'Soluble solids', 'Չոր նյութեր'], 'numeric', 60, null, '% Brix',
    ['Рефрактометр', 'Refractometer', 'Ռեֆրակտոմետր'], ['Каждая варка', 'Each cook', 'Յուրաքանչյուր եփում'], E.r01);
  const pPh = param(oprp1, 'PH', ['Кислотность', 'Acidity', 'Թթվայնություն'], 'numeric', null, 3.6, 'pH',
    ['pH-метр', 'pH meter', 'pH-չափիչ'], ['Каждая варка', 'Each cook', 'Յուրաքանչյուր եփում'], E.p01);

  // ── Несоответствия (3) ── // DEMO
  const iaId = insert(db, 'internal_audit', { code: 'IA-001', audit_date: d(-120), scope_i18n: L('PRP и записи ККТ', 'PRP and CCP records', 'PRP և ՀԿԿ գրառումներ'), status: 'completed' });
  insert(db, 'internal_audit', { code: 'IA-002', audit_date: d(30), scope_i18n: L('Прослеживаемость и склад', 'Traceability and warehouse', 'Հետագծելիություն և պահեստ'), status: 'planned' });

  const strQ = B('B-STR-04');
  const nc1 = insert(db, 'nonconformity', {
    code: 'NC-001', source_type: 'monitoring', source_id: null, fg_batch_id: strQ.id,
    description: 'ККТ-1: температура розлива 82,4 °C ниже критического предела 85 °C', severity: 'major', status: 'in_analysis',
    registered_at: yerevan(d(-2), '14:35'), due_date: d(12),
  });
  const nc2 = insert(db, 'nonconformity', {
    code: 'NC-002', source_type: 'incoming', source_id: lots['RL-CHR-02'].id, material_lot_id: lots['RL-CHR-02'].id,
    description: 'Партия вишни RL-CHR-02 принята без CoA поставщика', severity: 'minor', status: 'capa_assigned',
    root_cause: 'Не проверено наличие CoA при приёмке', registered_at: yerevan(d(-10), '10:00'), due_date: d(5),
  });
  const nc3 = insert(db, 'nonconformity', {
    code: 'NC-003', source_type: 'audit', source_id: iaId,
    description: 'Записи мойки оборудования заполнены не полностью', severity: 'minor', status: 'closed',
    root_cause: 'Форма записи не содержала обязательных полей', registered_at: yerevan(d(-120), '15:00'), due_date: d(-60),
    closed_at: yerevan(d(-9), '12:00'),
  });
  insert(db, 'audit_finding', { audit_id: iaId, text: 'Неполные записи мойки', nc_id: nc3 });
  insert(db, 'five_whys', { nc_id: nc2, steps: JSON.stringify(['CoA не запрошен', 'Нет пункта в чек-листе приёмки', 'Чек-лист не пересматривался']), root_cause: 'Не проверено наличие CoA при приёмке' });
  insert(db, 'ishikawa_cause', { nc_id: nc2, category: 'method', text: 'Чек-лист приёмки без пункта CoA' });
  insert(db, 'ishikawa_cause', { nc_id: nc2, category: 'man', text: 'Новый кладовщик не обучен' });

  // ── CAPA (2): одна просрочена ── // DEMO
  insert(db, 'capa', { code: 'CAPA-001', nc_id: nc2, action: 'Добавить проверку CoA в чек-лист приёмки и обучить персонал склада', type: 'corrective', owner_id: users['qa.lab'], due_date: d(-3), status: 'in_progress' });
  insert(db, 'capa', {
    code: 'CAPA-002', nc_id: nc3, action: 'Обновить форму записи мойки', type: 'preventive', owner_id: users['haccp.lead'], due_date: d(-25),
    status: 'closed', eff_checked_date: d(-10), eff_result: 'Записи за 30 дней заполнены полностью', eff_checked_by: users['haccp.lead'],
  });

  // ── Записи мониторинга (12): одна вне предела → NC-001, партия B-STR-04 на карантине ── // DEMO
  const op = { id: users.operator, name: 'Карен Мкртчян' };
  const mon = (cpId: string, paramId: string, batch: string, day: number, time: string, v: { num?: number; pass?: boolean },
    equipment: string, min: number | null, max: number | null, inLimits: boolean, ncId: string | null = null) => {
    const at = yerevan(d(day), time);
    return insert(db, 'monitoring_record', {
      control_point_id: cpId, parameter_id: paramId, fg_batch_id: B(batch).id, value_num: v.num ?? null,
      value_pass: v.pass === undefined ? null : Number(v.pass), event_at: at, recorded_at: at, operator_id: op.id,
      operator_name_snapshot: op.name, equipment_id: equipment, limit_min_snapshot: min, limit_max_snapshot: max,
      in_limits: Number(inLimits), nc_id: ncId,
    });
  };
  mon(oprp1, pPh, 'B-CHR-03', -8, '09:10', { num: 3.5 }, E.p01, null, 3.6, true); // до истечения поверки P-01
  mon(oprp1, pBrix, 'B-CHR-03', -8, '09:12', { num: 61.2 }, E.r01, 60, null, true);
  mon(oprp1, pBrix, 'B-APR-04', -5, '09:05', { num: 62.5 }, E.r01, 60, null, true);
  mon(ccp1, pT, 'B-APR-04', -5, '10:30', { num: 87.2 }, E.t01, 85, null, true);
  mon(ccp2, pFe, 'B-APR-04', -5, '11:00', { pass: true }, E.md01, null, null, true);
  mon(ccp2, pNfe, 'B-APR-04', -5, '11:01', { pass: true }, E.md01, null, null, true);
  mon(ccp2, pSs, 'B-APR-04', -5, '11:02', { pass: true }, E.md01, null, null, true);
  mon(ccp1, pT, 'B-CHR-04', -4, '10:40', { num: 86.1 }, E.t01, 85, null, true);
  mon(oprp1, pBrix, 'B-STR-03', -3, '09:00', { num: 61.0 }, E.r01, 60, null, true);
  mon(ccp1, pT, 'B-STR-03', -3, '10:15', { num: 88.0 }, E.t01, 85, null, true);
  const outRec = mon(ccp1, pT, 'B-STR-04', -2, '14:30', { num: 82.4 }, E.t01, 85, null, false, nc1);
  db.prepare('UPDATE nonconformity SET source_id = ? WHERE id = ?').run(outRec, nc1);
  mon(ccp2, pFe, 'B-STR-04', -2, '15:00', { pass: true }, E.md01, null, null, true);

  // ── Точки среды (4) и записи за 14 дней ── // DEMO
  const envPoint = (code: string, zone: [string, string, string], kind: string, min: number | null, max: number | null, unit: string, equipment: string) =>
    insert(db, 'env_point', { code, zone_i18n: L(...zone), kind, limit_min: min, limit_max: max, unit, equipment_id: equipment });
  const points = [
    { id: envPoint('ENV-01', ['Камера хранения фруктов', 'Fruit cold store', 'Մրգերի սառնարանային խցիկ'], 'temperature', 0, 4, '°C', E.th01), base: 2, spread: 1.4 },
    { id: envPoint('ENV-02', ['Склад готовой продукции', 'Finished goods store', 'Պատրաստի արտադրանքի պահեստ'], 'temperature', 5, 25, '°C', E.th02), base: 17, spread: 4 },
    { id: envPoint('ENV-03', ['Склад готовой продукции', 'Finished goods store', 'Պատրաստի արտադրանքի պահեստ'], 'humidity', null, 75, '%', E.th02), base: 60, spread: 8 },
    { id: envPoint('ENV-04', ['Цех фасовки', 'Filling area', 'Լցման արտադրամաս'], 'temperature', 15, 30, '°C', E.th03), base: 23, spread: 3 },
  ];
  const wh = { id: users.warehouse, name: 'Тигран Оганесян' };
  for (let day = -14; day <= -1; day++) {
    for (const time of ['08:00', '20:00']) {
      points.forEach((p, i) => {
        let value = +(p.base + (rnd() * 2 - 1) * p.spread).toFixed(1);
        if (i === 0 && day === -3 && time === '20:00') value = 6.2; // отклонение: камера фруктов выше 4 °C
        const lim = db.prepare('SELECT limit_min, limit_max FROM env_point WHERE id = ?').get(p.id) as { limit_min: number | null; limit_max: number | null };
        const ok = (lim.limit_min === null || value >= lim.limit_min) && (lim.limit_max === null || value <= lim.limit_max);
        const at = yerevan(d(day), time);
        insert(db, 'env_record', { point_id: p.id, value, event_at: at, recorded_at: at, recorded_by: wh.id, recorded_by_name_snapshot: wh.name, in_limits: Number(ok) });
      });
    }
  }

  // ── PRP (8), все проверены в срок; чек-листы ── // DEMO
  const section = (n: string) => db.prepare('SELECT id FROM prp_section WHERE number = ?').pluck().get(n) as string;
  const prpDefs: [string, string, [string, string, string], number, number][] = [
    ['PRP-01', '6', ['Контроль качества питьевой воды', 'Potable water quality control', 'Խմելու ջրի որակի հսկում'], 30, -10],
    ['PRP-02', '11', ['Мойка и дезинфекция линии фасовки', 'Cleaning and disinfection of the filling line', 'Լցման գծի լվացում և ախտահանում'], 7, -2],
    ['PRP-03', '12', ['Осмотр точек контроля вредителей', 'Inspection of pest control points', 'Վնասատուների հսկման կետերի զննում'], 30, -12],
    ['PRP-04', '13', ['Гигиена персонала на входе в цех', 'Personnel hygiene at production entry', 'Անձնակազմի հիգիենա արտադրամաս մուտքի մոտ'], 7, -3],
    ['PRP-05', '7', ['Вывоз и учёт отходов', 'Waste removal and records', 'Թափոնների դուրսբերում և հաշվառում'], 30, -15],
    ['PRP-06', '8', ['Плановое обслуживание оборудования', 'Planned equipment maintenance', 'Սարքավորումների պլանային սպասարկում'], 90, -40],
    ['PRP-07', '16', ['Условия хранения на складах', 'Storage conditions in warehouses', 'Պահեստներում պահպանման պայմաններ'], 30, -5],
    ['PRP-08', '10', ['Контроль стекла и хрупких материалов', 'Glass and brittle materials control', 'Ապակու և փխրուն նյութերի հսկում'], 30, -20],
  ];
  const prps: Record<string, string> = {};
  for (const [code, sec, desc, freq, last] of prpDefs) {
    prps[code] = insert(db, 'prp', { code, section_id: section(sec), description_i18n: L(...desc), frequency_days: freq, last_checked_date: d(last), status: 'active' });
  }
  const checklist = (prp: string, day: number, by: string, items: [[string, string, string], string][]) => {
    const id = insert(db, 'prp_checklist', { prp_id: prps[prp], performed_date: d(day), performed_by: users[by], status: 'completed' });
    for (const [q, result] of items) insert(db, 'prp_checklist_item', { checklist_id: id, question_i18n: L(...q), result });
  };
  checklist('PRP-02', -2, 'qa.lab', [
    [['Линия разобрана и промыта', 'Line disassembled and rinsed', 'Գիծը ապամոնտաժված և լվացված է'], 'ok'],
    [['Концентрация дезсредства в норме', 'Disinfectant concentration within range', 'Ախտահանիչի խտությունը նորմայում է'], 'ok'],
    [['ATP-смыв ниже порога', 'ATP swab below threshold', 'ATP լվացուկը շեմից ցածր է'], 'ok'],
  ]);
  checklist('PRP-04', -3, 'qa.lab', [
    [['Спецодежда чистая', 'Workwear clean', 'Արտահագուստը մաքուր է'], 'ok'],
    [['Нет украшений', 'No jewellery', 'Զարդեր չկան'], 'ok'],
  ]);

  // ── Тест прослеживаемости (в пределах 12 месяцев) ── // DEMO
  const started = yerevan(d(-60), '10:00');
  insert(db, 'trace_exercise', {
    code: 'TR-001', type: 'trace', fg_batch_id: B('B-APR-02').id, started_at: started,
    finished_at: new Date(Date.parse(started) + 95 * 60_000).toISOString(), duration_min: 95, target_min_snapshot: 240,
    compliant: 1, created_by: users['qa.lab'],
  });

  // ── Каркасы: пробы, претензии, документы, анализ руководства, прочее ── // DEMO
  insert(db, 'lab_sample', { code: 'LS-001', fg_batch_id: strQ.id, method_i18n: L('Сухие вещества (рефрактометрия)', 'Soluble solids (refractometry)', 'Չոր նյութեր (ռեֆրակտոմետրիա)'), result: '61,5 % Brix', spec: '≥ 60 % Brix', sampled_date: d(-2), approval_stage: 'registered' });
  insert(db, 'lab_sample', { code: 'LS-002', fg_batch_id: B('B-APR-04').id, method_i18n: L('Дрожжи и плесени', 'Yeasts and moulds', 'Խմորասնկեր և բորբոսներ'), result: '< 10 КОЕ/г', spec: '≤ 50 КОЕ/г', sampled_date: d(-5), approval_stage: 'first_approval' });
  insert(db, 'lab_sample', { code: 'LS-003', material_lot_id: lots['RL-CHR-02'].id, method_i18n: L('Остатки пестицидов (скрининг)', 'Pesticide residues (screening)', 'Թունաքիմիկատների մնացորդներ (սքրինինգ)'), result: 'не обнаружено', spec: 'не обнаружено', sampled_date: d(-10), approval_stage: 'approved' });

  insert(db, 'claim', { code: 'CL-001', customer_id: C[1], fg_batch_id: B('B-CHR-02').id, category: 'packaging', status: 'investigation', received_date: d(-4) });
  insert(db, 'claim', { code: 'CL-002', customer_id: C[0], fg_batch_id: B('B-APR-01').id, category: 'taste', status: 'closed', received_date: d(-20) });

  insert(db, 'document', { code: 'SOP-01', version: 2, status: 'current', title_i18n: L('Процедура управления документацией', 'Document control procedure', 'Փաստաթղթերի կառավարման ընթացակարգ'), approved_date: d(-200), review_due_date: d(165) });
  insert(db, 'document', { code: 'SOP-02', version: 1, status: 'current', title_i18n: L('Процедура мойки и дезинфекции', 'Cleaning and disinfection procedure', 'Լվացման և ախտահանման ընթացակարգ'), approved_date: d(-345), review_due_date: d(20) });
  insert(db, 'document', { code: 'SOP-03', version: 1, status: 'draft', title_i18n: L('Программа борьбы с вредителями', 'Pest control programme', 'Վնասատուների դեմ պայքարի ծրագիր') });

  const scaffold = (module: string, day: number, data: Record<string, unknown>) => insert(db, 'scaffold_record', { module, record_date: d(day), data: JSON.stringify(data) });
  scaffold('D08', -90, { code: 'MR-001', title: L('Анализ со стороны руководства за полугодие', 'Half-year management review', 'Ղեկավարության կիսամյակային վերլուծություն'), status: 'completed' });
  scaffold('A05', -1, { code: 'SAN-001', area: L('Линия фасовки №1', 'Filling line No. 1', 'Լցման գիծ №1'), method: 'CIP', atp: 85, result: 'ok' });
  scaffold('A05', -2, { code: 'SAN-002', area: L('Варочный котёл', 'Cooking kettle', 'Եփման կաթսա'), method: 'COP', atp: 120, result: 'ok' });
  scaffold('A06', -12, { code: 'PC-001', point: 'R-05', activity: 0, contractor: 'DEMO «Дезсервис»' });
  scaffold('A06', -42, { code: 'PC-002', point: 'R-11', activity: 1, contractor: 'DEMO «Дезсервис»' });
  scaffold('A07', -30, { code: 'TRN-001', topic: L('Принципы ХАССП', 'HACCP principles', 'HACCP սկզբունքներ'), attendees: 12 });
  scaffold('A07', -7, { code: 'TRN-002', topic: L('Гигиена рук', 'Hand hygiene', 'Ձեռքերի հիգիենա'), attendees: 18 });
  scaffold('A08', -100, { code: 'ALG-001', product: 'FG-APR-370', allergens: [], note: L('Аллергены не используются', 'No allergens used', 'Ալերգեններ չեն օգտագործվում') });
  scaffold('A09', -150, { code: 'VUL-001', material: 'RM-APR', risk: 'low' });
  scaffold('B02', 1, { code: 'WO-001', product: 'FG-APR-370', qty: 2000, shift: 'A' });
  scaffold('B02', 2, { code: 'WO-002', product: 'FG-CHR-450', qty: 1800, shift: 'B' });

  // ── Уведомление об отклонении ККТ ── // DEMO
  for (const role of ['haccp_lead', 'qa_lab']) {
    insert(db, 'notification', { recipient_role: role, type: 'ccp_deviation', ref_type: 'nonconformity', ref_id: nc1, params: JSON.stringify({ code: 'NC-001', batch: 'B-STR-04' }), created_at: yerevan(d(-2), '14:31') });
  }
}
