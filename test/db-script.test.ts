import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { listMigrations, slug, timestamp } from "../scripts/db.mjs";

describe("scripts/db.mjs", () => {
  it("타임스탬프는 Supabase CLI 와 같은 14자리", () => {
    expect(timestamp(new Date("2026-10-14T01:02:03Z"))).toBe("20261014010203");
  });

  it("이름은 소문자·밑줄로 만든다", () => {
    expect(slug("Add Todos-Table")).toBe("add_todos_table");
    expect(() => slug("!!")).toThrow();
  });

  it("파일명 순서대로 읽고 형식이 틀린 파일은 거부한다", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mig-"));
    await writeFile(path.join(dir, "20260102000000_b.sql"), "");
    await writeFile(path.join(dir, "20260101000000_a.sql"), "");
    expect((await listMigrations(dir)).map((m: { name: string }) => m.name)).toEqual(["a", "b"]);
    await writeFile(path.join(dir, "bad.sql"), "");
    await expect(listMigrations(dir)).rejects.toThrow("형식");
  });
});
