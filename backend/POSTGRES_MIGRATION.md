# PostgreSQL Migration Plan for ZAI

Current production uses SQLite at `backend/zai.db`. The code is now dependency-ready for PostgreSQL via `postgresql+asyncpg://...`.

Recommended migration steps:

1. Create PostgreSQL database and user.
2. Stop write traffic briefly: `systemctl stop zai-backend.service`.
3. Backup SQLite: `sqlite3 zai.db ".backup zai-before-postgres.db"`.
4. Export/import data with a controlled script or Alembic migration path.
5. Set `.env` `DATABASE_URL=postgresql+asyncpg://...`.
6. Run schema creation/migrations.
7. Start backend: `systemctl start zai-backend.service`.
8. Verify `/health`, auth, purchase pending, admin approve, and task run.

Do not switch directly without a fresh backup and a data import rehearsal.
