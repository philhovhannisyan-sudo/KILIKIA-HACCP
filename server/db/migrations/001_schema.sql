-- HACCP Suite: полная схема MVP (docs/01-plan.md §3, docs/02-data-model.md).
-- id — ULID (TEXT); *_at — момент UTC ISO-8601; *_date — деловая дата YYYY-MM-DD (Asia/Yerevan);
-- *_i18n — JSON {"ru","en","hy"}. Удаление со ссылками проверяется в приложении (server/core/integrity.ts).

-- ───────────── Платформа ─────────────
CREATE TABLE site (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE role (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL);
CREATE TABLE permission (code TEXT PRIMARY KEY, module TEXT NOT NULL);
CREATE TABLE role_permission (
  role_id TEXT NOT NULL REFERENCES role(id), permission_code TEXT NOT NULL REFERENCES permission(code),
  PRIMARY KEY (role_id, permission_code)
);
CREATE TABLE user (
  id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, site_id TEXT REFERENCES site(id)
);
CREATE TABLE user_role (
  user_id TEXT NOT NULL REFERENCES user(id), role_id TEXT NOT NULL REFERENCES role(id), PRIMARY KEY (user_id, role_id)
);
CREATE TABLE session (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE login_event (
  id TEXT PRIMARY KEY, login TEXT NOT NULL, user_id TEXT, at TEXT NOT NULL, result TEXT NOT NULL, ip TEXT
);
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY,               -- монотонный номер записи
  id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL,                      -- серверное время
  user_id TEXT,
  user_name_snapshot TEXT NOT NULL,      -- имя на момент записи
  roles_snapshot TEXT NOT NULL,          -- JSON-массив кодов ролей на момент записи
  module TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
  before TEXT, after TEXT, comment TEXT,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE
);
CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE notification (
  id TEXT PRIMARY KEY, recipient_role TEXT, recipient_user_id TEXT, type TEXT NOT NULL,
  ref_type TEXT, ref_id TEXT, params TEXT, created_at TEXT NOT NULL, read_at TEXT
);
CREATE TABLE file (
  id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  content BLOB NOT NULL, uploaded_by TEXT REFERENCES user(id), uploaded_at TEXT NOT NULL
);
CREATE TABLE standard_clause (
  id TEXT PRIMARY KEY, standard TEXT NOT NULL, number TEXT NOT NULL, short_name_i18n TEXT NOT NULL,
  rule_code TEXT NOT NULL, verify_status TEXT NOT NULL, ord INTEGER NOT NULL
);

-- ───────────── Движок процессов ─────────────
CREATE TABLE fsm_state (
  machine TEXT NOT NULL, code TEXT NOT NULL, is_initial INTEGER NOT NULL DEFAULT 0, is_final INTEGER NOT NULL DEFAULT 0,
  ord INTEGER NOT NULL, PRIMARY KEY (machine, code)
);
CREATE TABLE fsm_transition (
  id TEXT PRIMARY KEY, machine TEXT NOT NULL, from_state TEXT NOT NULL, to_state TEXT NOT NULL,
  permission TEXT NOT NULL REFERENCES permission(code), comment_required INTEGER NOT NULL DEFAULT 0,
  guards TEXT NOT NULL DEFAULT '[]',
  UNIQUE (machine, from_state, to_state)
);

-- ───────────── Производство и склад ─────────────
CREATE TABLE material (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('raw','packaging')), unit TEXT NOT NULL);
CREATE TABLE product (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL, spec_i18n TEXT,
  shelf_life_days INTEGER NOT NULL, packaging_i18n TEXT, nutrition TEXT
);
CREATE TABLE recipe (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES product(id), version INTEGER NOT NULL,
  valid_from TEXT NOT NULL, status TEXT NOT NULL, UNIQUE (product_id, version)
);
CREATE TABLE recipe_line (
  id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipe(id), material_id TEXT NOT NULL REFERENCES material(id),
  qty_per_unit REAL NOT NULL, unit TEXT NOT NULL, UNIQUE (recipe_id, material_id)
);
CREATE TABLE supplier (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, rating REAL, approval_status TEXT NOT NULL
);
CREATE TABLE supplier_document (
  id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES supplier(id), type TEXT NOT NULL,
  file_id TEXT REFERENCES file(id), valid_to TEXT
);
CREATE TABLE material_lot (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, material_id TEXT NOT NULL REFERENCES material(id),
  supplier_id TEXT NOT NULL REFERENCES supplier(id), received_date TEXT NOT NULL, expiry_date TEXT NOT NULL,
  qty REAL NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TABLE material_lot_document (
  id TEXT PRIMARY KEY, material_lot_id TEXT NOT NULL REFERENCES material_lot(id), file_id TEXT NOT NULL REFERENCES file(id), type TEXT NOT NULL
);
CREATE TABLE production_line (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL);
CREATE TABLE fg_batch (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, product_id TEXT NOT NULL REFERENCES product(id),
  recipe_id TEXT REFERENCES recipe(id), produced_date TEXT NOT NULL, line_id TEXT NOT NULL REFERENCES production_line(id),
  shift TEXT NOT NULL, qty REAL NOT NULL, status TEXT NOT NULL
);
CREATE TABLE batch_consumption (
  id TEXT PRIMARY KEY, fg_batch_id TEXT NOT NULL REFERENCES fg_batch(id), material_lot_id TEXT NOT NULL REFERENCES material_lot(id),
  qty REAL NOT NULL, UNIQUE (fg_batch_id, material_lot_id)
);
CREATE TABLE warehouse (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL);
CREATE TABLE stock (
  id TEXT PRIMARY KEY, warehouse_id TEXT NOT NULL REFERENCES warehouse(id),
  lot_kind TEXT NOT NULL CHECK (lot_kind IN ('material','fg')), lot_id TEXT NOT NULL, qty REAL NOT NULL,
  UNIQUE (warehouse_id, lot_kind, lot_id)
);
CREATE TABLE customer (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, address TEXT);
CREATE TABLE shipment (
  id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL REFERENCES customer(id),
  shipped_date TEXT NOT NULL, transport_temp_min REAL, transport_temp_max REAL
);
CREATE TABLE shipment_line (
  id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL REFERENCES shipment(id), fg_batch_id TEXT NOT NULL REFERENCES fg_batch(id),
  qty REAL NOT NULL, fefo_override_reason TEXT
);

-- ───────────── ХАССП и безопасность ─────────────
CREATE TABLE haccp_plan (
  id TEXT PRIMARY KEY, lineage_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
  title_i18n TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '[]', wizard_state TEXT NOT NULL DEFAULT '{}',
  site_verified_date TEXT, site_verified_by TEXT, approved_at TEXT, approved_by TEXT,
  effective_from TEXT, effective_to TEXT, created_at TEXT NOT NULL, UNIQUE (lineage_id, version)
);
CREATE TABLE haccp_team_member (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES haccp_plan(id), name TEXT NOT NULL, role TEXT NOT NULL, competence TEXT
);
CREATE TABLE process_step (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES haccp_plan(id), ord INTEGER NOT NULL, name_i18n TEXT NOT NULL, description TEXT
);
CREATE TABLE hazard (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES haccp_plan(id), step_id TEXT NOT NULL REFERENCES process_step(id),
  type TEXT NOT NULL CHECK (type IN ('bio','chem','phys','allergen')), description_i18n TEXT NOT NULL,
  likelihood INTEGER NOT NULL, severity INTEGER NOT NULL, significant INTEGER NOT NULL,
  control_measure_i18n TEXT, result TEXT NOT NULL
);
CREATE TABLE hazard_decision (
  id TEXT PRIMARY KEY, hazard_id TEXT NOT NULL REFERENCES hazard(id), node TEXT NOT NULL,
  answer TEXT NOT NULL CHECK (answer IN ('yes','no')), justification TEXT NOT NULL CHECK (length(trim(justification)) > 0), ord INTEGER NOT NULL
);
CREATE TABLE oprp_assessment (
  id TEXT PRIMARY KEY, hazard_id TEXT NOT NULL UNIQUE REFERENCES hazard(id), criteria TEXT NOT NULL, justification TEXT, result TEXT
);
CREATE TABLE control_point (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('CCP','OPRP')),
  plan_lineage_id TEXT NOT NULL, hazard_id TEXT REFERENCES hazard(id), step_id TEXT REFERENCES process_step(id),
  name_i18n TEXT NOT NULL, responsible_role TEXT NOT NULL, corrective_action_i18n TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (plan_lineage_id, code)
);
CREATE TABLE equipment (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_i18n TEXT NOT NULL, zone_i18n TEXT, kind TEXT NOT NULL,
  last_cal_date TEXT, next_cal_date TEXT, status TEXT NOT NULL, certificate TEXT, certificate_file_id TEXT REFERENCES file(id)
);
CREATE TABLE control_parameter (
  id TEXT PRIMARY KEY, control_point_id TEXT NOT NULL REFERENCES control_point(id), code TEXT NOT NULL, name_i18n TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('numeric','pass_fail')), limit_min REAL, limit_max REAL, unit TEXT,
  method_i18n TEXT NOT NULL, frequency_i18n TEXT NOT NULL, equipment_id TEXT REFERENCES equipment(id),
  UNIQUE (control_point_id, code)
);
CREATE TABLE nonconformity (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('monitoring','environment','incoming','audit','claim','recall','manual')),
  source_id TEXT, fg_batch_id TEXT REFERENCES fg_batch(id), material_lot_id TEXT REFERENCES material_lot(id),
  description TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('minor','major','critical')), status TEXT NOT NULL,
  root_cause TEXT, registered_at TEXT NOT NULL, due_date TEXT NOT NULL, closed_at TEXT
);
CREATE TABLE monitoring_record (
  id TEXT PRIMARY KEY, control_point_id TEXT NOT NULL REFERENCES control_point(id),
  parameter_id TEXT NOT NULL REFERENCES control_parameter(id), fg_batch_id TEXT NOT NULL REFERENCES fg_batch(id),
  value_num REAL, value_pass INTEGER, event_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
  operator_id TEXT NOT NULL REFERENCES user(id), operator_name_snapshot TEXT NOT NULL,
  equipment_id TEXT REFERENCES equipment(id), limit_min_snapshot REAL, limit_max_snapshot REAL,
  in_limits INTEGER NOT NULL, nc_id TEXT REFERENCES nonconformity(id)
);
CREATE TABLE monitoring_correction (
  id TEXT PRIMARY KEY, original_id TEXT NOT NULL REFERENCES monitoring_record(id),
  value_num REAL, value_pass INTEGER, in_limits INTEGER NOT NULL, reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  author_id TEXT NOT NULL REFERENCES user(id), author_name_snapshot TEXT NOT NULL, at TEXT NOT NULL, nc_id TEXT REFERENCES nonconformity(id)
);
CREATE TABLE env_point (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, zone_i18n TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('temperature','humidity')),
  limit_min REAL, limit_max REAL, unit TEXT NOT NULL, equipment_id TEXT REFERENCES equipment(id)
);
CREATE TABLE env_record (
  id TEXT PRIMARY KEY, point_id TEXT NOT NULL REFERENCES env_point(id), value REAL NOT NULL,
  event_at TEXT NOT NULL, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES user(id),
  recorded_by_name_snapshot TEXT NOT NULL, in_limits INTEGER NOT NULL, nc_id TEXT REFERENCES nonconformity(id)
);
CREATE TABLE env_correction (
  id TEXT PRIMARY KEY, original_id TEXT NOT NULL REFERENCES env_record(id), value REAL NOT NULL, in_limits INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0), author_id TEXT NOT NULL REFERENCES user(id),
  author_name_snapshot TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE prp_section (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, short_name_i18n TEXT NOT NULL, verify_status TEXT NOT NULL);
CREATE TABLE prp (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, section_id TEXT NOT NULL REFERENCES prp_section(id),
  description_i18n TEXT NOT NULL, frequency_days INTEGER NOT NULL, last_checked_date TEXT, status TEXT NOT NULL
);
CREATE TABLE prp_checklist (
  id TEXT PRIMARY KEY, prp_id TEXT NOT NULL REFERENCES prp(id), performed_date TEXT NOT NULL,
  performed_by TEXT NOT NULL REFERENCES user(id), status TEXT NOT NULL
);
CREATE TABLE prp_checklist_item (
  id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL REFERENCES prp_checklist(id), question_i18n TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('ok','nok','na')), note TEXT, file_id TEXT REFERENCES file(id)
);
CREATE TABLE trace_exercise (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK (type IN ('trace','recall')),
  fg_batch_id TEXT NOT NULL REFERENCES fg_batch(id), started_at TEXT NOT NULL, finished_at TEXT,
  duration_min REAL, target_min_snapshot REAL NOT NULL, compliant INTEGER, nc_id TEXT REFERENCES nonconformity(id),
  created_by TEXT NOT NULL REFERENCES user(id)
);
CREATE TABLE recall_item (
  id TEXT PRIMARY KEY, exercise_id TEXT NOT NULL REFERENCES trace_exercise(id),
  shipment_line_id TEXT NOT NULL REFERENCES shipment_line(id), returned INTEGER NOT NULL DEFAULT 0, returned_qty REAL
);

-- ───────────── Качество ─────────────
CREATE TABLE five_whys (id TEXT PRIMARY KEY, nc_id TEXT NOT NULL UNIQUE REFERENCES nonconformity(id), steps TEXT NOT NULL, root_cause TEXT);
CREATE TABLE ishikawa_cause (
  id TEXT PRIMARY KEY, nc_id TEXT NOT NULL REFERENCES nonconformity(id),
  category TEXT NOT NULL CHECK (category IN ('man','machine','method','material','measurement','environment')), text TEXT NOT NULL
);
CREATE TABLE capa (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, nc_id TEXT NOT NULL REFERENCES nonconformity(id), action TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('corrective','preventive')), owner_id TEXT NOT NULL REFERENCES user(id),
  due_date TEXT NOT NULL, status TEXT NOT NULL, eff_checked_date TEXT, eff_result TEXT, eff_checked_by TEXT REFERENCES user(id)
);
CREATE TABLE lab_sample (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, fg_batch_id TEXT REFERENCES fg_batch(id), material_lot_id TEXT REFERENCES material_lot(id),
  method_i18n TEXT NOT NULL, result TEXT, spec TEXT, sampled_date TEXT NOT NULL, approval_stage TEXT NOT NULL
);
CREATE TABLE internal_audit (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, audit_date TEXT NOT NULL, scope_i18n TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TABLE audit_finding (
  id TEXT PRIMARY KEY, audit_id TEXT NOT NULL REFERENCES internal_audit(id), text TEXT NOT NULL, nc_id TEXT REFERENCES nonconformity(id)
);
CREATE TABLE claim (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL REFERENCES customer(id),
  fg_batch_id TEXT REFERENCES fg_batch(id), category TEXT NOT NULL, status TEXT NOT NULL, received_date TEXT NOT NULL
);
CREATE TABLE document (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, title_i18n TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
  approved_date TEXT, review_due_date TEXT, UNIQUE (code, version)
);
CREATE TABLE scaffold_record (id TEXT PRIMARY KEY, module TEXT NOT NULL, record_date TEXT NOT NULL, data TEXT NOT NULL);

-- ───────────── Неизменяемость (CLAUDE.md, brief §6) ─────────────
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'immutable:audit_log'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'immutable:audit_log'); END;
CREATE TRIGGER monitoring_record_no_update BEFORE UPDATE ON monitoring_record BEGIN SELECT RAISE(ABORT, 'immutable:monitoring_record'); END;
CREATE TRIGGER monitoring_record_no_delete BEFORE DELETE ON monitoring_record BEGIN SELECT RAISE(ABORT, 'immutable:monitoring_record'); END;
CREATE TRIGGER monitoring_correction_no_update BEFORE UPDATE ON monitoring_correction BEGIN SELECT RAISE(ABORT, 'immutable:monitoring_correction'); END;
CREATE TRIGGER monitoring_correction_no_delete BEFORE DELETE ON monitoring_correction BEGIN SELECT RAISE(ABORT, 'immutable:monitoring_correction'); END;
CREATE TRIGGER env_record_no_update BEFORE UPDATE ON env_record BEGIN SELECT RAISE(ABORT, 'immutable:env_record'); END;
CREATE TRIGGER env_record_no_delete BEFORE DELETE ON env_record BEGIN SELECT RAISE(ABORT, 'immutable:env_record'); END;
CREATE TRIGGER env_correction_no_update BEFORE UPDATE ON env_correction BEGIN SELECT RAISE(ABORT, 'immutable:env_correction'); END;
CREATE TRIGGER env_correction_no_delete BEFORE DELETE ON env_correction BEGIN SELECT RAISE(ABORT, 'immutable:env_correction'); END;
CREATE TRIGGER login_event_no_update BEFORE UPDATE ON login_event BEGIN SELECT RAISE(ABORT, 'immutable:login_event'); END;
CREATE TRIGGER login_event_no_delete BEFORE DELETE ON login_event BEGIN SELECT RAISE(ABORT, 'immutable:login_event'); END;

CREATE INDEX idx_audit_object ON audit_log(object_type, object_id);
CREATE INDEX idx_monitoring_cp ON monitoring_record(control_point_id, event_at);
CREATE INDEX idx_env_point ON env_record(point_id, event_at);
CREATE INDEX idx_consumption_lot ON batch_consumption(material_lot_id);
CREATE INDEX idx_shipment_line_batch ON shipment_line(fg_batch_id);
