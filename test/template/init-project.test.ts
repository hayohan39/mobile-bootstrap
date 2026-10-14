// 템플릿 전용 테스트. 새 프로젝트에서는 init-project 가 이 디렉터리를 지운다.
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BUNDLE_ID_RE, bundleSegment, defaultBundleId, initProject, TEMPLATE_ONLY } from "../../scripts/init-project.mjs";

const ROOT = path.resolve(__dirname, "..", "..");
const COPY = ["src", "scripts", "docs", "supabase", ".github", ".claude", "test", "CLAUDE.md", "README.md", "app.json", "package.json", "package-lock.json"];

describe("init-project", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function copyTemplate() {
    dir = await mkdtemp(path.join(os.tmpdir(), "init-"));
    for (const entry of COPY) {
      if (existsSync(path.join(ROOT, entry))) {
        await cp(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
      }
    }
    return dir;
  }

  it("플레이스홀더·앱 식별자를 채우고 템플릿 전용 파일을 지운다", async () => {
    const root = await copyTemplate();
    const changed = await initProject(root, {
      name: "word-cards",
      description: 'He said "hi"',
      displayName: "단어 카드",
      bundleId: "com.me.wordcards",
    });
    expect(changed).toBe(true);

    const projectTs = await readFile(path.join(root, "src/lib/project.ts"), "utf8");
    expect(projectTs).toContain('name: "word-cards"');
    expect(projectTs).toContain('description: "He said \\"hi\\""');

    const { expo } = JSON.parse(await readFile(path.join(root, "app.json"), "utf8"));
    expect(expo).toMatchObject({ name: "단어 카드", slug: "word-cards", scheme: "wordcards" });
    expect(expo.ios.bundleIdentifier).toBe("com.me.wordcards");
    expect(expo.android.package).toBe("com.me.wordcards");
    expect(expo.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(expo.owner).toBeUndefined();

    expect(await readFile(path.join(root, "supabase/config.toml"), "utf8")).toMatch(/^project_id = "word-cards"$/m);

    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(pkg.name).toBe("word-cards");
    const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
    expect(lock.name).toBe("word-cards");
    expect(lock.packages[""].name).toBe("word-cards");

    for (const rel of TEMPLATE_ONLY) expect(existsSync(path.join(root, rel)), rel).toBe(false);

    for (const rel of ["CLAUDE.md", "README.md", "src/lib/project.ts", "docs/decisions.md"]) {
      const text = await readFile(path.join(root, rel), "utf8");
      expect(text, rel).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(text, rel).not.toContain("template-only");
    }
  });

  it("bundle id 를 주지 않으면 이름으로 만든다", async () => {
    const root = await copyTemplate();
    await initProject(root, { name: "2048-game" });
    const { expo } = JSON.parse(await readFile(path.join(root, "app.json"), "utf8"));
    expect(expo.android.package).toBe("com.example.app2048game");
    expect(expo.name).toBe("2048-game");
  });

  it("두 번째 실행은 아무것도 하지 않는다", async () => {
    const root = await copyTemplate();
    await initProject(root, { name: "my-app" });
    expect(await initProject(root, { name: "other" })).toBe(false);
  });

  it("잘못된 이름·bundle id 를 거부한다", async () => {
    const root = await copyTemplate();
    await expect(initProject(root, { name: "My_App" })).rejects.toThrow();
    await expect(initProject(root, { name: "my-app", bundleId: "com.me.my-app" })).rejects.toThrow("bundle id");
  });

  it("bundle id 세그먼트 정리", () => {
    expect(bundleSegment("HayoHan-39")).toBe("hayohan39");
    expect(bundleSegment("7days")).toBe("app7days");
    expect(() => bundleSegment("--")).toThrow();
    expect(defaultBundleId("hayohan39", "word-cards")).toBe("com.hayohan39.wordcards");
    expect(BUNDLE_ID_RE.test("com.me.app")).toBe(true);
    expect(BUNDLE_ID_RE.test("app")).toBe(false);
    expect(BUNDLE_ID_RE.test("com.Me.app")).toBe(false);
  });
});
