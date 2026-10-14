-- Фаза 3: отклонение «кандидата в ККТ» руководителем ХАССП (Р-3) и отметка шагов мастера
ALTER TABLE oprp_assessment ADD COLUMN override_candidate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oprp_assessment ADD COLUMN override_by TEXT REFERENCES user(id);
