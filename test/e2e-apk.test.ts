import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { canReuse } from "../scripts/e2e-apk.mjs";

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "e2e-apk-"));
  const git = (...args: string[]) => String(execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, stdio: "pipe" })).trim();
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  write("src/app/index.tsx", "export default 1;\n");
  write(".maestro/smoke.yaml", "appId: x\n");
  const apk = commit("apk");
  return { dir, git, write, commit, apk };
}

describe("e2e-apk canReuse", () => {
  it("흐름(.maestro)·테스트·문서만 바뀌었으면 APK 를 다시 쓴다", () => {
    const r = repo();
    r.write(".maestro/smoke.yaml", "appId: y\n");
    r.write("test/a.test.ts", "x\n");
    r.write("docs/a.md", "x\n");
    r.commit("flow fix");
    expect(canReuse(r.apk, "HEAD", r.dir).reuse).toBe(true);
  });

  it("같은 커밋이면 다시 쓴다", () => {
    const r = repo();
    expect(canReuse(r.apk, "HEAD", r.dir).reuse).toBe(true);
  });

  it("앱 코드(src/)·앱 설정·APK 빌드 방법이 바뀌었으면 새로 빌드한다", () => {
    const r = repo();
    r.write("src/app/index.tsx", "export default 2;\n");
    r.commit("app change");
    const res = canReuse(r.apk, "HEAD", r.dir);
    expect(res.reuse).toBe(false);
    expect(res.reason).toContain("src/app/index.tsx");

    const r3 = repo();
    r3.write(".github/actions/android-e2e/action.yml", "name: x\n");
    r3.commit("build recipe");
    expect(canReuse(r3.apk, "HEAD", r3.dir).reuse).toBe(false);

    const r2 = repo();
    r2.write("app.json", "{}\n");
    r2.commit("config");
    expect(canReuse(r2.apk, "HEAD", r2.dir).reuse).toBe(false);
  });

  it("APK 커밋이 지금 커밋의 조상이 아니면(다른 브랜치) 새로 빌드한다", () => {
    const r = repo();
    r.git("checkout", "-q", "-b", "other");
    r.write("src/app/index.tsx", "export default 3;\n");
    const other = r.commit("other branch app change");
    r.git("checkout", "-q", "main");
    r.write(".maestro/smoke.yaml", "appId: z\n");
    r.commit("flow");
    const res = canReuse(other, "HEAD", r.dir);
    expect(res.reuse).toBe(false);
    expect(res.reason).toContain("조상");
  });

  it("커밋 값이 이상하면 새로 빌드한다", () => {
    const r = repo();
    expect(canReuse("", "HEAD", r.dir).reuse).toBe(false);
    expect(canReuse("not-a-sha; rm -rf /", "HEAD", r.dir).reuse).toBe(false);
    expect(canReuse("0".repeat(40), "HEAD", r.dir).reuse).toBe(false);
  });
});
