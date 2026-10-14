# Модель данных HACCP Suite (docs/02-data-model.md)

Итоговая модель данных. СУБД — SQLite, один файл `data/haccp.sqlite` (меняется переменной `HACCP_DATA_DIR`).
Схема — `server/db/migrations/*.sql`; раздел «Таблицы» ниже генерируется из неё командой `npx tsx scripts/gen-data-model.ts`.

## Соглашения

| Что | Как |
|---|---|
| Идентификаторы | ULID (TEXT), создаются приложением — позволяют в одной транзакции связать запись мониторинга и несоответствие. У пользователей — стабильные `U-<логин>` (сессии переживают сброс и импорт). |
| Время | `*_at` — момент UTC ISO-8601, серверное время; `*_date` — деловая дата `YYYY-MM-DD` в Asia/Yerevan. У записей событий два поля: `event_at` (факт) и `recorded_at` (сервер). |
| Многоязычные справочники | `*_i18n` — JSON `{"ru","en","hy"}`. Свободный текст пользователя хранится как введён. |
| Демо-данные | Только `server/seed/demo.ts` (`// DEMO`); даты считаются от дня сидинга. |
| Нормативные данные | `server/seed/base.ts` — строго из `docs/regulatory-refs.md`, `verify_status = 'СВЕРИТЬ'`. |

## Неизменяемость (CLAUDE.md, brief §6)

Триггеры БД запрещают `UPDATE` и `DELETE` для `audit_log`, `monitoring_record`, `monitoring_correction`, `env_record`, `env_correction`, `login_event`. Исправление записи мониторинга или среды — новая запись-корректировка (`*_correction`) со ссылкой на исходную, причиной, автором (снимок имени) и временем; действующим считается значение последней корректировки.

## Журнал аудита

`audit_log`: монотонный `seq`, серверное время, `user_name_snapshot` и `roles_snapshot` на момент записи, модуль, тип и id объекта, действие, `before`/`after` (канонический JSON), комментарий.
`hash = sha256(канонический JSON полей записи + prev_hash)`; первая запись базы ссылается на `0…0` или (после сброса) на последний хэш прежней базы. Проверка — `verifyChain()` / `GET /api/audit/verify`: указывает номер записи, где цепочка нарушена.

## Права (RBAC)

`permission` (код `модуль.объект.действие`), `role`, `role_permission`, `user_role`. Права пользователя — объединение прав всех его ролей. Источник — `shared/permissions.ts`. Каждый маршрут `/api` объявляет требуемое право; проверка — одна функция на сервере; отказ — `403 { error: "forbidden", params: { permission } }`.

## Конечные автоматы

`fsm_state`, `fsm_transition` (откуда, куда, право, нужен ли комментарий, guard-условия). Источник — `shared/fsm.ts`; движок — `server/core/fsm.ts`. Состояние — поле `status` сущности; каждый переход пишется в журнал. Недопустимый переход — `409 invalid_transition` с перечнем доступных.

| Автомат | Сущности | Состояния |
|---|---|---|
| `nc` | `nonconformity` | registered → in_analysis → root_cause_identified → capa_assigned → capa_done → effectiveness_check → closed; effectiveness_check → in_analysis («нерезультативно») |
| `haccp_plan` | `haccp_plan` | draft → under_approval → approved → under_revision → archived |
| `batch` | `fg_batch`, `material_lot` | quarantine → checks_done → released; → blocked → disposal / rework → quarantine |
| `capa` | `capa` | planned → in_progress → done → verified → closed |
| `document` | `document` | draft → under_approval → current → under_revision → cancelled |

## Целостность

Удаление объекта с входящими ссылками отклоняется перечнем «таблица — количество — коды» (`server/core/integrity.ts`, ссылки берутся из внешних ключей схемы + полиморфная ссылка источника несоответствия). Остальные правила (выпуск партии без расхода сырья, отгрузка партии на карантине, FEFO, дубль сырья в рецептуре) — guard-условия автоматов и проверки сервисов соответствующих фаз.

## Файл состояния (экспорт / импорт / бэкап)

`{ format: "haccp-suite-state", version: 1, exportedAt, tables: { <таблица>: [строки] } }`, gzip; BLOB — `{"$b64": "…"}`. Не экспортируются сессии. Импорт — только администратор: проверка формата и ссылок во временной базе, затем подмена файла; перед сбросом и импортом автоматически сохраняется бэкап в `data/backups/`. Нормализованный дамп для К9 — без `login_event` и системных записей журнала об экспорте/сбросе/импорте.

## Таблицы

<!-- tables:auto -->

#### `site`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |
| active | INTEGER | да |  |

Уникальность: (code).

#### `role`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |

Уникальность: (code).

#### `permission`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **code** (PK) | TEXT | да |  |
| module | TEXT | да |  |

#### `role_permission`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **role_id** (PK) | TEXT | да | → role |
| **permission_code** (PK) | TEXT | да | → permission |

#### `user`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| login | TEXT | да |  |
| full_name | TEXT | да |  |
| password_hash | TEXT | да |  |
| active | INTEGER | да |  |
| site_id | TEXT |  | → site |

Уникальность: (login).

#### `user_role`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **user_id** (PK) | TEXT | да | → user |
| **role_id** (PK) | TEXT | да | → role |

#### `session`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **token_hash** (PK) | TEXT | да |  |
| user_id | TEXT | да | → user |
| created_at | TEXT | да |  |
| expires_at | TEXT | да |  |

#### `login_event`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| login | TEXT | да |  |
| user_id | TEXT |  |  |
| at | TEXT | да |  |
| result | TEXT | да |  |
| ip | TEXT |  |  |

#### `audit_log`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **seq** (PK) | INTEGER | да |  |
| id | TEXT | да |  |
| at | TEXT | да |  |
| user_id | TEXT |  |  |
| user_name_snapshot | TEXT | да |  |
| roles_snapshot | TEXT | да |  |
| module | TEXT | да |  |
| object_type | TEXT | да |  |
| object_id | TEXT |  |  |
| action | TEXT | да |  |
| before | TEXT |  |  |
| after | TEXT |  |  |
| comment | TEXT |  |  |
| prev_hash | TEXT | да |  |
| hash | TEXT | да |  |

Уникальность: (hash); (id).

#### `setting`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **key** (PK) | TEXT | да |  |
| value | TEXT | да |  |
| is_demo | INTEGER | да |  |

#### `notification`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| recipient_role | TEXT |  |  |
| recipient_user_id | TEXT |  |  |
| type | TEXT | да |  |
| ref_type | TEXT |  |  |
| ref_id | TEXT |  |  |
| params | TEXT |  |  |
| created_at | TEXT | да |  |
| read_at | TEXT |  |  |

#### `file`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| sha256 | TEXT | да |  |
| name | TEXT | да |  |
| mime | TEXT | да |  |
| size | INTEGER | да |  |
| content | BLOB | да |  |
| uploaded_by | TEXT |  | → user |
| uploaded_at | TEXT | да |  |

#### `standard_clause`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| standard | TEXT | да |  |
| number | TEXT | да |  |
| short_name_i18n | TEXT | да |  |
| rule_code | TEXT | да |  |
| verify_status | TEXT | да |  |
| ord | INTEGER | да |  |

#### `fsm_state`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **machine** (PK) | TEXT | да |  |
| **code** (PK) | TEXT | да |  |
| is_initial | INTEGER | да |  |
| is_final | INTEGER | да |  |
| ord | INTEGER | да |  |

#### `fsm_transition`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| machine | TEXT | да |  |
| from_state | TEXT | да |  |
| to_state | TEXT | да |  |
| permission | TEXT | да | → permission |
| comment_required | INTEGER | да |  |
| guards | TEXT | да |  |

Уникальность: (machine, from_state, to_state).

#### `material`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |
| kind | TEXT | да |  |
| unit | TEXT | да |  |

Уникальность: (code).

#### `product`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |
| spec_i18n | TEXT |  |  |
| shelf_life_days | INTEGER | да |  |
| packaging_i18n | TEXT |  |  |
| nutrition | TEXT |  |  |

Уникальность: (code).

#### `recipe`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| product_id | TEXT | да | → product |
| version | INTEGER | да |  |
| valid_from | TEXT | да |  |
| status | TEXT | да |  |

Уникальность: (product_id, version).

#### `recipe_line`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| recipe_id | TEXT | да | → recipe |
| material_id | TEXT | да | → material |
| qty_per_unit | REAL | да |  |
| unit | TEXT | да |  |

Уникальность: (recipe_id, material_id).

#### `supplier`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name | TEXT | да |  |
| rating | REAL |  |  |
| approval_status | TEXT | да |  |

Уникальность: (code).

#### `supplier_document`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| supplier_id | TEXT | да | → supplier |
| type | TEXT | да |  |
| file_id | TEXT |  | → file |
| valid_to | TEXT |  |  |

#### `material_lot`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| material_id | TEXT | да | → material |
| supplier_id | TEXT | да | → supplier |
| received_date | TEXT | да |  |
| expiry_date | TEXT | да |  |
| qty | REAL | да |  |
| unit | TEXT | да |  |
| status | TEXT | да |  |

Уникальность: (code).

#### `material_lot_document`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| material_lot_id | TEXT | да | → material_lot |
| file_id | TEXT | да | → file |
| type | TEXT | да |  |

#### `production_line`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |

Уникальность: (code).

#### `fg_batch`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| product_id | TEXT | да | → product |
| recipe_id | TEXT |  | → recipe |
| produced_date | TEXT | да |  |
| line_id | TEXT | да | → production_line |
| shift | TEXT | да |  |
| qty | REAL | да |  |
| status | TEXT | да |  |

Уникальность: (code).

#### `batch_consumption`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| fg_batch_id | TEXT | да | → fg_batch |
| material_lot_id | TEXT | да | → material_lot |
| qty | REAL | да |  |

Уникальность: (fg_batch_id, material_lot_id).

#### `warehouse`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |

Уникальность: (code).

#### `stock`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| warehouse_id | TEXT | да | → warehouse |
| lot_kind | TEXT | да |  |
| lot_id | TEXT | да |  |
| qty | REAL | да |  |

Уникальность: (warehouse_id, lot_kind, lot_id).

#### `customer`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name | TEXT | да |  |
| address | TEXT |  |  |

Уникальность: (code).

#### `shipment`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| number | TEXT | да |  |
| customer_id | TEXT | да | → customer |
| shipped_date | TEXT | да |  |
| transport_temp_min | REAL |  |  |
| transport_temp_max | REAL |  |  |

Уникальность: (number).

#### `shipment_line`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| shipment_id | TEXT | да | → shipment |
| fg_batch_id | TEXT | да | → fg_batch |
| qty | REAL | да |  |
| fefo_override_reason | TEXT |  |  |

#### `haccp_plan`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| lineage_id | TEXT | да |  |
| version | INTEGER | да |  |
| status | TEXT | да |  |
| title_i18n | TEXT | да |  |
| scope | TEXT | да |  |
| wizard_state | TEXT | да |  |
| site_verified_date | TEXT |  |  |
| site_verified_by | TEXT |  |  |
| approved_at | TEXT |  |  |
| approved_by | TEXT |  |  |
| effective_from | TEXT |  |  |
| effective_to | TEXT |  |  |
| created_at | TEXT | да |  |

Уникальность: (lineage_id, version).

#### `haccp_team_member`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| plan_id | TEXT | да | → haccp_plan |
| name | TEXT | да |  |
| role | TEXT | да |  |
| competence | TEXT |  |  |

#### `process_step`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| plan_id | TEXT | да | → haccp_plan |
| ord | INTEGER | да |  |
| name_i18n | TEXT | да |  |
| description | TEXT |  |  |

#### `hazard`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| plan_id | TEXT | да | → haccp_plan |
| step_id | TEXT | да | → process_step |
| type | TEXT | да |  |
| description_i18n | TEXT | да |  |
| likelihood | INTEGER | да |  |
| severity | INTEGER | да |  |
| significant | INTEGER | да |  |
| control_measure_i18n | TEXT |  |  |
| result | TEXT | да |  |

#### `hazard_decision`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| hazard_id | TEXT | да | → hazard |
| node | TEXT | да |  |
| answer | TEXT | да |  |
| justification | TEXT | да |  |
| ord | INTEGER | да |  |

#### `oprp_assessment`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| hazard_id | TEXT | да | → hazard |
| criteria | TEXT | да |  |
| justification | TEXT |  |  |
| result | TEXT |  |  |
| override_candidate | INTEGER | да |  |
| override_by | TEXT |  | → user |

Уникальность: (hazard_id).

#### `control_point`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| type | TEXT | да |  |
| plan_lineage_id | TEXT | да |  |
| hazard_id | TEXT |  | → hazard |
| step_id | TEXT |  | → process_step |
| name_i18n | TEXT | да |  |
| responsible_role | TEXT | да |  |
| corrective_action_i18n | TEXT | да |  |
| active | INTEGER | да |  |

Уникальность: (plan_lineage_id, code).

#### `equipment`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |
| zone_i18n | TEXT |  |  |
| kind | TEXT | да |  |
| last_cal_date | TEXT |  |  |
| next_cal_date | TEXT |  |  |
| status | TEXT | да |  |
| certificate | TEXT |  |  |
| certificate_file_id | TEXT |  | → file |

Уникальность: (code).

#### `control_parameter`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| control_point_id | TEXT | да | → control_point |
| code | TEXT | да |  |
| name_i18n | TEXT | да |  |
| kind | TEXT | да |  |
| limit_min | REAL |  |  |
| limit_max | REAL |  |  |
| unit | TEXT |  |  |
| method_i18n | TEXT | да |  |
| frequency_i18n | TEXT | да |  |
| equipment_id | TEXT |  | → equipment |

Уникальность: (control_point_id, code).

#### `nonconformity`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| source_type | TEXT | да |  |
| source_id | TEXT |  |  |
| fg_batch_id | TEXT |  | → fg_batch |
| material_lot_id | TEXT |  | → material_lot |
| description | TEXT | да |  |
| severity | TEXT | да |  |
| status | TEXT | да |  |
| root_cause | TEXT |  |  |
| registered_at | TEXT | да |  |
| due_date | TEXT | да |  |
| closed_at | TEXT |  |  |

Уникальность: (code).

#### `monitoring_record`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| control_point_id | TEXT | да | → control_point |
| parameter_id | TEXT | да | → control_parameter |
| fg_batch_id | TEXT | да | → fg_batch |
| value_num | REAL |  |  |
| value_pass | INTEGER |  |  |
| event_at | TEXT | да |  |
| recorded_at | TEXT | да |  |
| operator_id | TEXT | да | → user |
| operator_name_snapshot | TEXT | да |  |
| equipment_id | TEXT |  | → equipment |
| limit_min_snapshot | REAL |  |  |
| limit_max_snapshot | REAL |  |  |
| in_limits | INTEGER | да |  |
| nc_id | TEXT |  | → nonconformity |

#### `monitoring_correction`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| original_id | TEXT | да | → monitoring_record |
| value_num | REAL |  |  |
| value_pass | INTEGER |  |  |
| in_limits | INTEGER | да |  |
| reason | TEXT | да |  |
| author_id | TEXT | да | → user |
| author_name_snapshot | TEXT | да |  |
| at | TEXT | да |  |
| nc_id | TEXT |  | → nonconformity |

#### `env_point`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| zone_i18n | TEXT | да |  |
| kind | TEXT | да |  |
| limit_min | REAL |  |  |
| limit_max | REAL |  |  |
| unit | TEXT | да |  |
| equipment_id | TEXT |  | → equipment |

Уникальность: (code).

#### `env_record`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| point_id | TEXT | да | → env_point |
| value | REAL | да |  |
| event_at | TEXT | да |  |
| recorded_at | TEXT | да |  |
| recorded_by | TEXT | да | → user |
| recorded_by_name_snapshot | TEXT | да |  |
| in_limits | INTEGER | да |  |
| nc_id | TEXT |  | → nonconformity |

#### `env_correction`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| original_id | TEXT | да | → env_record |
| value | REAL | да |  |
| in_limits | INTEGER | да |  |
| reason | TEXT | да |  |
| author_id | TEXT | да | → user |
| author_name_snapshot | TEXT | да |  |
| at | TEXT | да |  |

#### `prp_section`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| number | TEXT | да |  |
| short_name_i18n | TEXT | да |  |
| verify_status | TEXT | да |  |

Уникальность: (number).

#### `prp`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| section_id | TEXT | да | → prp_section |
| description_i18n | TEXT | да |  |
| frequency_days | INTEGER | да |  |
| last_checked_date | TEXT |  |  |
| status | TEXT | да |  |

Уникальность: (code).

#### `prp_checklist`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| prp_id | TEXT | да | → prp |
| performed_date | TEXT | да |  |
| performed_by | TEXT | да | → user |
| status | TEXT | да |  |

#### `prp_checklist_item`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| checklist_id | TEXT | да | → prp_checklist |
| question_i18n | TEXT | да |  |
| result | TEXT | да |  |
| note | TEXT |  |  |
| file_id | TEXT |  | → file |

#### `trace_exercise`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| type | TEXT | да |  |
| fg_batch_id | TEXT | да | → fg_batch |
| started_at | TEXT | да |  |
| finished_at | TEXT |  |  |
| duration_min | REAL |  |  |
| target_min_snapshot | REAL | да |  |
| compliant | INTEGER |  |  |
| nc_id | TEXT |  | → nonconformity |
| created_by | TEXT | да | → user |

Уникальность: (code).

#### `recall_item`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| exercise_id | TEXT | да | → trace_exercise |
| shipment_line_id | TEXT | да | → shipment_line |
| returned | INTEGER | да |  |
| returned_qty | REAL |  |  |

#### `five_whys`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| nc_id | TEXT | да | → nonconformity |
| steps | TEXT | да |  |
| root_cause | TEXT |  |  |

Уникальность: (nc_id).

#### `ishikawa_cause`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| nc_id | TEXT | да | → nonconformity |
| category | TEXT | да |  |
| text | TEXT | да |  |

#### `capa`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| nc_id | TEXT | да | → nonconformity |
| action | TEXT | да |  |
| type | TEXT | да |  |
| owner_id | TEXT | да | → user |
| due_date | TEXT | да |  |
| status | TEXT | да |  |
| eff_checked_date | TEXT |  |  |
| eff_result | TEXT |  |  |
| eff_checked_by | TEXT |  | → user |

Уникальность: (code).

#### `lab_sample`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| fg_batch_id | TEXT |  | → fg_batch |
| material_lot_id | TEXT |  | → material_lot |
| method_i18n | TEXT | да |  |
| result | TEXT |  |  |
| spec | TEXT |  |  |
| sampled_date | TEXT | да |  |
| approval_stage | TEXT | да |  |

Уникальность: (code).

#### `internal_audit`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| audit_date | TEXT | да |  |
| scope_i18n | TEXT | да |  |
| status | TEXT | да |  |

Уникальность: (code).

#### `audit_finding`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| audit_id | TEXT | да | → internal_audit |
| text | TEXT | да |  |
| nc_id | TEXT |  | → nonconformity |

#### `claim`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| customer_id | TEXT | да | → customer |
| fg_batch_id | TEXT |  | → fg_batch |
| category | TEXT | да |  |
| status | TEXT | да |  |
| received_date | TEXT | да |  |

Уникальность: (code).

#### `document`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| code | TEXT | да |  |
| title_i18n | TEXT | да |  |
| version | INTEGER | да |  |
| status | TEXT | да |  |
| approved_date | TEXT |  |  |
| review_due_date | TEXT |  |  |

Уникальность: (code, version).

#### `scaffold_record`

| Поле | Тип | Обяз. | Ссылка |
|---|---|---|---|
| **id** (PK) | TEXT | да |  |
| module | TEXT | да |  |
| record_date | TEXT | да |  |
| data | TEXT | да |  |
