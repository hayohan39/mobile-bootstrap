import pg from "pg";

// DB(RLS) 테스트 도우미. TEST_DATABASE_URL 이 있을 때만 돈다(세션 시작 훅·CI 가 설정).
// 마이그레이션은 vitest globalSetup(test/db/setup.ts)이 테스트 전에 적용한다.
export const DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

// auth.users 에 테스트 사용자를 만든다(트랜잭션 안에서 쓰면 테스트 끝에 사라진다).
export async function createUser(client: pg.Client, email = `user-${crypto.randomUUID()}@example.com`): Promise<string> {
  // 실제 Supabase 의 auth.users.id 에는 기본값이 없어 직접 만든다.
  const { rows } = await client.query<{ id: string }>("insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id", [email]);
  return rows[0].id;
}

// 앱(클라이언트)이 보는 그대로 쿼리한다: 역할을 authenticated/anon 으로 바꾸고 JWT claim 을 심는다.
// Supabase 의 PostgREST 가 요청마다 하는 일과 같다. 반드시 트랜잭션(begin) 안에서 부른다.
export async function actAs(client: pg.Client, userId: string | null): Promise<void> {
  const role = userId ? "authenticated" : "anon";
  const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await client.query(`set local role ${role}`);
}

// RLS·권한이 막아야 하는 쿼리. 트랜잭션 안에서 실패해도 이어서 테스트할 수 있게 savepoint 로 감싼다.
export async function expectDenied(client: pg.Client, sql: string, params: unknown[] = []): Promise<void> {
  await client.query("savepoint denied");
  try {
    await client.query(sql, params);
  } catch {
    await client.query("rollback to savepoint denied");
    return;
  }
  throw new Error(`막혀야 하는 쿼리가 실행됐다: ${sql}`);
}
