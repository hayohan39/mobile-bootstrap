import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";

import { actAs, connect, createUser, DATABASE_URL } from "./helpers";

// RLS 테스트가 기대는 기본기(auth.uid(), 역할 전환)가 동작하는지 확인한다.
// 테이블을 추가하면 같은 방식으로 "남의 행은 못 읽고 못 쓴다" 를 테스트한다(예: test/db/*.test.ts).
describe.skipIf(!DATABASE_URL)("auth 기본기", () => {
  let client: pg.Client;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  it("actAs 로 지정한 사용자가 auth.uid() 로 보인다", async () => {
    await client.query("begin");
    try {
      const id = await createUser(client);
      await actAs(client, id);
      const { rows } = await client.query("select auth.uid() as uid, current_user as role");
      expect(rows[0]).toEqual({ uid: id, role: "authenticated" });
    } finally {
      await client.query("rollback");
    }
  });

  it("익명이면 auth.uid() 는 null 이다", async () => {
    await client.query("begin");
    try {
      await actAs(client, null);
      const { rows } = await client.query("select auth.uid() as uid, current_user as role");
      expect(rows[0]).toEqual({ uid: null, role: "anon" });
    } finally {
      await client.query("rollback");
    }
  });
});
