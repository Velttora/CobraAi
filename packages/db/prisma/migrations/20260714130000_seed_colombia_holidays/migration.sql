-- Seed Colombian national public holidays for 2026 and 2027 (18 per year).
-- Idempotent: ON CONFLICT on the unique `date` column, so re-applying is a no-op.
-- Annual maintenance: add a new data migration with the next year's 18 holidays.
INSERT INTO "holidays" ("date", "name") VALUES ('2026-01-01', 'Año Nuevo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-01-12', 'Día de los Reyes Magos') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-03-23', 'Día de San José') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-04-02', 'Jueves Santo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-04-03', 'Viernes Santo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-05-01', 'Día del Trabajo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-05-18', 'Ascensión del Señor') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-06-08', 'Corpus Christi') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-06-15', 'Sagrado Corazón de Jesús') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-06-29', 'San Pedro y San Pablo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-07-20', 'Día de la Independencia') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-08-07', 'Batalla de Boyacá') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-08-17', 'Asunción de la Virgen') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-10-12', 'Día de la Raza') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-11-02', 'Día de Todos los Santos') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-11-16', 'Independencia de Cartagena') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-12-08', 'Inmaculada Concepción') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2026-12-25', 'Navidad') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-01-01', 'Año Nuevo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-01-11', 'Día de los Reyes Magos') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-03-22', 'Día de San José') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-03-25', 'Jueves Santo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-03-26', 'Viernes Santo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-05-01', 'Día del Trabajo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-05-10', 'Ascensión del Señor') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-05-31', 'Corpus Christi') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-06-07', 'Sagrado Corazón de Jesús') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-07-05', 'San Pedro y San Pablo') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-07-20', 'Día de la Independencia') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-08-07', 'Batalla de Boyacá') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-08-16', 'Asunción de la Virgen') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-10-18', 'Día de la Raza') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-11-01', 'Día de Todos los Santos') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-11-15', 'Independencia de Cartagena') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-12-08', 'Inmaculada Concepción') ON CONFLICT ("date") DO NOTHING;
INSERT INTO "holidays" ("date", "name") VALUES ('2027-12-25', 'Navidad') ON CONFLICT ("date") DO NOTHING;
