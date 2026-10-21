# Higanna database setup

Higanna uses MySQL for permanent data and Prisma for schema management. Use a
different database and password for development, staging, and production.

## Local development with Docker

1. Copy `.env.example` to `.env`.
2. Start only the local MySQL service:

   ```powershell
   docker compose -f compose.dev.yml up -d mysql
   ```

3. Validate the schema and create the development database tables:

   ```powershell
   npm run db:validate
   npm run db:generate
   npm run db:migrate:dev
   ```

4. Inspect records when needed:

   ```powershell
   npm run db:studio
   ```

The local container listens only on `127.0.0.1:3307`. The example passwords in
`compose.dev.yml` are for local development only.

## Existing local MySQL installation

Create an isolated database and restricted application user:

```sql
CREATE DATABASE higanna_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'higanna_app'@'localhost' IDENTIFIED BY 'replace-with-a-local-password';
GRANT ALL PRIVILEGES ON higanna_dev.* TO 'higanna_app'@'localhost';
FLUSH PRIVILEGES;
```

Update `DATABASE_URL` in `.env` to use that username, password, host and port.
URL-encode special characters inside the password.

## Production deployment

Do not run `prisma migrate dev` on the server. After backing up the production
database, install dependencies and apply committed migrations with:

```bash
cd /var/www/higanna
npm ci
npm run db:generate
npm run db:migrate:deploy
```

Then build and restart the application using the existing `/higanna` deployment
environment. Keep the production `DATABASE_URL` only in the server-side `.env`
or PM2 environment; never upload it to source control or expose it through a
`NEXT_PUBLIC_` variable.

## Migration rules

- Create migrations in development and review the SQL before deployment.
- Commit `prisma/schema.prisma` and every directory under `prisma/migrations`.
- Back up production before applying a migration.
- Never edit a migration after it has been applied to a shared environment.
- Never point local development at the live production database.
