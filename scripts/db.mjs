#!/usr/bin/env node
// 로컬/CI 에서 supabase/migrations 를 Postgres 에 적용한다(프로덕션 적용은 deploy 워크플로의 `supabase db push`).
//
//   node scripts/db.mjs apply   DATABASE_URL(없으면 TEST_DATABASE_URL) 에 아직 안 들어간 마이그레이션을 적용
//   node scripts/db.mjs status  적용/대기 목록
//   node scripts/db.mjs reset   (로컬 DB 만) public 스키마를 비우고 처음부터 다시 적용 — 브랜치를 오갈 때
//   node scripts/db.mjs new <이름>  supabase/migrations/<타임스탬프>_<이름>.sql 생성 (supabase migration new 와 같은 형식)
//
// 적용 기록은 Supabase CLI 와 같은 테이블(supabase_migrations.schema_migrations)에 남긴다.
// 대상 DB 에 auth 스키마가 없으면(Supabase 가 아닌 일반 Postgres) supabase/local-shim.sql 을 먼저 깐다.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const FILE_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export async function listMigrations(dir = MIGRATIONS_DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  return files.map((file) => {
    const m = FILE_RE.exec(file);
    if (!m) throw new Error(`마이그레이션 파일명 형식이 아닙니다: ${file} (YYYYMMDDHHMMSS_name.sql)`);
    return { version: m[1], name: m[2], file: path.join(dir, file) };
  });
}

export function timestamp(now = new Date()) {
  return now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function slug(name) {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) throw new Error("마이그레이션 이름이 필요합니다: npm run db:new -- add_todos");
  return s;
}

function databaseUrl() {
  const url = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 또는 TEST_DATABASE_URL 이 필요합니다");
  return url;
}

export function isLocalUrl(url) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
}

async function connect(url = databaseUrl()) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

async function ensureBase(client) {
  const { rows } = await client.query("select 1 from pg_namespace where nspname = 'auth'");
  if (rows.length === 0) await client.query(await readFile(path.join(ROOT, "supabase", "local-shim.sql"), "utf8"));
  await client.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
}

async function applied(client) {
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  return new Set(rows.map((r) => r.version));
}

export async function apply() {
  const client = await connect();
  try {
    await ensureBase(client);
    const done = await applied(client);
    for (const m of await listMigrations()) {
      if (done.has(m.version)) continue;
      const sql = await readFile(m.file, "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [m.version, m.name, [sql]]);
        await client.query("commit");
        console.log(`적용: ${path.basename(m.file)}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`${path.basename(m.file)} 실패: ${error.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function status() {
  const client = await connect();
  try {
    await ensureBase(client);
    const done = await applied(client);
    for (const m of await listMigrations()) console.log(`${done.has(m.version) ? "✓" : "…"} ${path.basename(m.file)}`);
  } finally {
    await client.end();
  }
}

async function reset() {
  const url = databaseUrl();
  if (!isLocalUrl(url)) throw new Error("reset 은 로컬 DB(localhost)에서만 쓸 수 있습니다");
  const client = await connect(url);
  try {
    await client.query(`drop schema if exists public cascade; drop schema if exists supabase_migrations cascade;
      create schema public; grant usage, create on schema public to postgres, anon, authenticated, service_role`);
  } finally {
    await client.end();
  }
  await apply();
}

async function create(name) {
  const file = path.join(MIGRATIONS_DIR, `${timestamp()}_${slug(name ?? "")}.sql`);
  await writeFile(file, "-- 이미 main 에 들어간 마이그레이션은 고치지 않는다. 바꿀 것은 새 파일로.\n", { flag: "wx" });
  console.log(path.relative(ROOT, file));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, arg] = process.argv.slice(2);
  const run = { apply, status, reset, new: () => create(arg) }[cmd];
  if (!run) {
    console.error("사용법: node scripts/db.mjs apply | status | reset | new <이름>");
    process.exit(2);
  }
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
