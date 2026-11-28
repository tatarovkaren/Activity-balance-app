# FatSecret Preview database results — 2026-11-28

Isolated project activity-balance-preview, PostgreSQL 17.12. Minimal day_entries schema and atomic import function deployed. RLS enabled, anon EXECUTE denied, authenticated EXECUTE allowed in Preview only.

SQL assertions executed with two synthetic auth.users and simulated authenticated JWT claims in one rolled-back transaction: PASS RLS isolation, preservation of weight and steps, stale repeat rejection, rollback of earlier insert on later conflict.

Not yet tested: actual login/JWT issuance, parallel sessions, legacy offline and Telegram writers, full schema, OAuth integration, invalid-input matrix. Production untouched. No release approval. No real personal data.

Additional rolled-back SQL assertions: PASS zero nutrition protection, photo meal protection, new day insert. FAIL legacy full-row upsert: stale steps-only snapshot overwrites imported nutrition. Reproduced in isolated database. Release blocked until all diary writers protect concurrent changes. Parallel sessions not yet tested.
