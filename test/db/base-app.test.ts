import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";

import { actAs, connect, createUser, DATABASE_URL, expectDenied } from "./helpers";

// 기본 테이블의 RLS: 남의 행은 읽지도 쓰지도 못하고, 원격 설정은 읽기만 된다.
describe.skipIf(!DATABASE_URL)("기본 테이블 RLS", () => {
  let client: pg.Client;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  async function tx(fn: () => Promise<void>) {
    await client.query("begin");
    try {
      await fn();
    } finally {
      await client.query("rollback");
    }
  }

  it("가입하면 프로필이 생기고, 본인 것만 보이고 고칠 수 있다", () =>
    tx(async () => {
      const me = await createUser(client);
      const other = await createUser(client);
      await actAs(client, me);
      const { rows } = await client.query("select id from public.profiles");
      expect(rows).toEqual([{ id: me }]);
      await client.query("update public.profiles set display_name = '나'");
      const updated = await client.query("update public.profiles set display_name = '해킹' where id = $1", [other]);
      expect(updated.rowCount).toBe(0);
    }));

  it("로그인 전에도 원격 설정은 읽지만 아무도 바꾸지 못한다", () =>
    tx(async () => {
      await actAs(client, null);
      const { rows } = await client.query("select key from public.app_config order by key");
      expect(rows.map((r) => r.key)).toEqual(["features", "maintenance", "min_version"]);
      const updated = await client.query("update public.app_config set value = '{}'").catch(() => null);
      expect(updated?.rowCount ?? 0).toBe(0);
    }));

  it("로그인한 사용자도 원격 설정을 바꾸지 못한다", () =>
    tx(async () => {
      await actAs(client, await createUser(client));
      await expectDenied(client, "insert into public.app_config (key, value) values ('x', '{}')");
    }));

  it("푸시 토큰은 본인 것만 넣고 본다", () =>
    tx(async () => {
      const me = await createUser(client);
      const other = await createUser(client);
      await actAs(client, me);
      await client.query("insert into public.push_tokens (token, platform) values ('ExponentPushToken[a]', 'ios')");
      await expectDenied(client, "insert into public.push_tokens (user_id, token, platform) values ($1, 'x', 'ios')", [other]);
      await actAs(client, other);
      const { rows } = await client.query("select * from public.push_tokens");
      expect(rows).toEqual([]);
    }));

  it("계정을 지우면 프로필과 푸시 토큰도 지워진다", () =>
    tx(async () => {
      const me = await createUser(client);
      await actAs(client, me);
      await client.query("insert into public.push_tokens (token, platform) values ('t', 'android')");
      await client.query("reset role");
      await client.query("delete from auth.users where id = $1", [me]);
      const p = await client.query("select 1 from public.profiles where id = $1", [me]);
      const t = await client.query("select 1 from public.push_tokens where user_id = $1", [me]);
      expect((p.rowCount ?? 0) + (t.rowCount ?? 0)).toBe(0);
    }));
});
