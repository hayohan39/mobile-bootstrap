import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { previousReview, runScan } from "../scripts/risk/cli.mjs";
import { bandLevel, toAnchor } from "../scripts/risk/levels.mjs";
import { decodeData, previewCell, renderSummary } from "../scripts/risk/render.mjs";
import { analyzeAppConfig, categorize, classifyStatement, globToRegExp, isNativePackage, parseUnifiedDiff, scanChanges, splitSql, tablesWithoutRls } from "../scripts/risk/scan.mjs";
import { applyPolicy, finalize, sectionFilled } from "../scripts/risk/score.mjs";

const config = JSON.parse(await readFile(path.resolve(".github/risk/config.json"), "utf8"));

type FileInput = { path: string; status?: string; added?: string[]; removed?: string[]; oldPath?: string };

type ScanOpts = { base?: Record<string, string>; head?: Record<string, string>; refs?: string[]; fingerprint?: { changed: boolean; sources?: string[] } };

function scan(files: FileInput[], opts: ScanOpts = {}) {
  return scanChanges({
    files: files.map((f) => ({
      path: f.path,
      oldPath: f.oldPath ?? f.path,
      status: f.status ?? "M",
      added: (f.added ?? []).map((text, i) => ({ line: i + 1, text })),
      removed: (f.removed ?? []).map((text) => ({ text })),
      binary: false,
    })),
    readBase: (p: string) => opts.base?.[p] ?? null,
    readHead: (p: string) => opts.head?.[p] ?? null,
    baseReferences: (word: string) => (opts.refs ?? []).includes(word),
    config,
    fingerprint: opts.fingerprint ?? null,
  });
}

const ids = (result: { signals: { id: string }[] }) => result.signals.map((s) => s.id);

describe("levels", () => {
  it("총점 구간", () => {
    expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(bandLevel)).toEqual([
      "LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "VERY_HIGH", "VERY_HIGH", "CRITICAL", "CRITICAL",
    ]);
  });
  it("기준값으로 올림한다", () => {
    expect([0, 3, 5, 12, 16, 25, -1, "x"].map(toAnchor)).toEqual([0, 5, 5, 15, 20, 20, 0, 0]);
  });
});

describe("경로 분류", () => {
  it("glob", () => {
    expect(globToRegExp("**/*.md").test("README.md")).toBe(true);
    expect(globToRegExp("**/*.md").test("docs/a/b.md")).toBe(true);
    expect(globToRegExp("src/**/*auth*").test("src/lib/auth.ts")).toBe(true);
    expect(globToRegExp("src/**/*auth*").test("src/app/author/index.tsx")).toBe(false);
    expect(globToRegExp("assets/images/android-icon-*.png").test("assets/images/android-icon-foreground.png")).toBe(true);
  });
  it("범주", () => {
    expect([...categorize(".github/workflows/ci.yml", config)]).toEqual(["infra"]);
    // 검사·배포를 건너뛸지 정하는 스크립트 — 고치면 CI·배포를 바꾸는 것과 같다.
    expect([...categorize("scripts/ci-changes.mjs", config)]).toEqual(["infra"]);
    expect(categorize(".github/workflows/pr-review.yml", config).has("riskSystem")).toBe(true);
    expect(categorize("supabase/functions/delete-account/index.ts", config).has("api")).toBe(true);
    expect(categorize("src/lib/supabase.ts", config).has("sharedCore")).toBe(true);
    expect(categorize("app.json", config).has("native")).toBe(true);
    expect(categorize("supabase/migrations/20260101000000_a.sql", config).has("migration")).toBe(true);
  });
});

describe("parseUnifiedDiff", () => {
  it("추가/삭제 줄과 줄 번호, 상태를 읽는다", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1..2 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -3,1 +10,2 @@",
      "-old",
      "+new1",
      "+new2",
      "diff --git a/migrations/1.sql b/migrations/1.sql",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/migrations/1.sql",
      "@@ -0,0 +1 @@",
      "+create table t (id int);",
      "diff --git a/src/old.ts b/src/new.ts",
      "similarity index 90%",
      "rename from src/old.ts",
      "rename to src/new.ts",
    ].join("\n");
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({ path: "src/a.ts", status: "M", added: [{ line: 10, text: "new1" }, { line: 11, text: "new2" }] });
    expect(files[1]).toMatchObject({ path: "migrations/1.sql", status: "A" });
    expect(files[2]).toMatchObject({ path: "src/new.ts", oldPath: "src/old.ts", status: "R" });
  });
});

describe("splitSql", () => {
  it("함수 본문·문자열 안의 ; 와 주석은 문장을 나누지 않는다", () => {
    const sql = [
      "-- 주석; 무시",
      "create function f() returns trigger language plpgsql as $$",
      "begin insert into t values (1); return new; end;",
      "$$;",
      "insert into t (a) values ('x;y'), ('it''s');",
      "create function g() returns int language sql as $body$ select 1; $body$; /* 끝; */",
    ].join("\n");
    const parts = splitSql(sql);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^create function f\(\).*end; \$\$$/);
    expect(parts[1]).toBe("insert into t (a) values ('x;y'), ('it''s')");
    expect(classifyStatement(parts[0])).toEqual([{ kind: "additive" }]);
  });
});

describe("SQL 분류", () => {
  const kinds = (sql: string, newTables = new Set<string>()) => classifyStatement(sql, newTables).map((x: { kind: string }) => x.kind);
  it("추가형", () => {
    expect(kinds("create table if not exists todos (id bigint primary key)")).toEqual(["additive"]);
    expect(kinds("alter table users add column nickname text")).toEqual(["additive"]);
    expect(kinds("create index concurrently if not exists i on users (email)")).toEqual(["additive"]);
    expect(kinds("create index i on todos (owner)", new Set(["todos"]))).toEqual(["additive"]);
    expect(kinds("alter table users add constraint c check (x > 0) not valid")).toEqual(["additive"]);
  });
  it("잠금·재작성", () => {
    expect(kinds("create index i on users (email)")).toEqual(["locking"]);
    expect(kinds("alter table users add column plan text not null")).toEqual(["locking"]);
    expect(kinds("alter table users add column created_at timestamptz default now()")).toEqual(["locking"]);
    expect(kinds("alter table users alter column email set not null")).toEqual(["locking"]);
  });
  it("호환성 깨짐·파괴", () => {
    expect(kinds("alter table users rename column email to mail")).toEqual(["breaking"]);
    expect(kinds("alter table users alter column age type bigint")).toEqual(["breaking"]);
    expect(kinds("alter table users drop column email, add column x text")).toEqual(["destructive", "additive"]);
    expect(kinds("drop table if exists sessions")).toEqual(["destructive"]);
    expect(kinds("truncate audit_log")).toEqual(["destructive"]);
    expect(kinds("delete from users")).toEqual(["destructive"]);
    expect(kinds("update users set plan = 'free'")).toEqual(["destructive"]);
    expect(kinds("update users set plan = 'free' where plan is null")).toEqual(["data"]);
  });
  it("이 PR 이 만든 테이블·컬럼에 대한 UPDATE 는 파괴적이지 않다", () => {
    expect(kinds("update todos set owner_id = 1", new Set(["todos"]))).toEqual(["additive"]);
    const cols = new Set(["users.plan_v2"]);
    expect(classifyStatement("update users set plan_v2 = plan", new Set(), cols)).toMatchObject([
      { kind: "data", detail: expect.stringContaining("백필") },
    ]);
    expect(classifyStatement("update users set plan = 'x', plan_v2 = plan", new Set(), cols)[0].kind).toBe("destructive");
  });
  it("권한·트랜잭션·미분류", () => {
    expect(kinds("grant select on users to analyst")).toEqual(["permission"]);
    expect(kinds("alter table users enable row level security")).toEqual(["permission"]);
    expect(kinds('create policy "own" on notes for all using (auth.uid() = user_id)', new Set(["notes"]))).toEqual(["policy-new"]);
    expect(kinds("grant select, insert on table notes to authenticated", new Set(["notes"]))).toEqual(["policy-new"]);
    expect(kinds('create policy "own" on users for all using (true)')).toEqual(["permission"]);
    expect(kinds("commit")).toEqual(["tx-control"]);
    expect(kinds("do $$ begin perform 1; end $$")).toEqual(["unclassified"]);
  });
});

describe("scanChanges", () => {
  it("문서만 바뀌면 런타임 영향 없음, floor 0", () => {
    const result = scan([{ path: "README.md", added: ["hi"] }, { path: "docs/runbook.md", added: ["x"] }]);
    expect(result.runtimeChanged).toBe(false);
    expect(result.floorTotal).toBe(0);
    expect(result.preliminaryLevel).toBe("LOW");
  });

  it("비밀값은 CRITICAL 이고 값은 결과에 남지 않는다", () => {
    const key = "AKIA" + "ABCDEFGHIJKLMNOP";
    const result = scan([{ path: "src/lib/aws.ts", status: "A", added: [`const k = "${key}";`] }]);
    expect(result.overrideLevel).toBe("CRITICAL");
    expect(result.floors.security).toBe(20);
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it("추가형 마이그레이션은 Migration 10 이고 등급을 강제로 올리지 않는다", () => {
    const sql =
      "create table todos (id bigint primary key, title text not null);\nalter table todos enable row level security;\ncreate index todos_title on todos (title);";
    const result = scan([{ path: "supabase/migrations/20260101_add_todos.sql", status: "A", added: sql.split("\n") }], {
      head: { "supabase/migrations/20260101_add_todos.sql": sql },
    });
    expect(result.floors.migration).toBe(10);
    // RLS 켜기는 권한 변경(HIGH)이지만, 새 테이블에 RLS 를 켜는 것은 필수라 같은 PR 의 새 테이블이면 추가형으로 본다.
    expect(result.overrideLevel).toBe("LOW");
    expect(ids(result)).toContain("migration.additive");
  });

  it("expand 단계: 컬럼 추가 + 백필은 HIGH (파괴적 아님)", () => {
    const sql = "alter table users add column plan_v2 text;\nupdate users set plan_v2 = plan;";
    const result = scan([{ path: "supabase/migrations/4.sql", status: "A", added: sql.split("\n") }], { head: { "supabase/migrations/4.sql": sql } });
    expect(ids(result)).toEqual(expect.arrayContaining(["migration.additive", "migration.data"]));
    expect(ids(result)).not.toContain("migration.destructive");
    expect(result.overrideLevel).toBe("HIGH");
  });

  it("현재 코드가 쓰는 컬럼을 지우면 CRITICAL", () => {
    const sql = "alter table users drop column email;";
    const result = scan([{ path: "supabase/migrations/2_drop.sql", status: "A", added: [sql] }], {
      head: { "supabase/migrations/2_drop.sql": sql },
      refs: ["email"],
    });
    expect(ids(result)).toEqual(expect.arrayContaining(["migration.destructive", "migration.referenced"]));
    expect(result.overrideLevel).toBe("CRITICAL");
  });

  it("코드가 더 이상 쓰지 않는 컬럼 삭제는 VERY HIGH (contract 단계)", () => {
    const sql = "alter table users drop column legacy_flag;";
    const result = scan([{ path: "supabase/migrations/3.sql", status: "A", added: [sql] }], { head: { "supabase/migrations/3.sql": sql } });
    expect(result.overrideLevel).toBe("VERY_HIGH");
  });

  it("이미 있는 마이그레이션을 고치면 VERY HIGH", () => {
    const result = scan([{ path: "supabase/migrations/1.sql", status: "M", added: ["x"] }]);
    expect(ids(result)).toContain("migration.edited");
    expect(result.overrideLevel).toBe("VERY_HIGH");
  });

  it("Edge Function 추가·삭제, 새 환경변수, 테스트 없음", () => {
    const result = scan([
      { path: "supabase/functions/charge/index.ts", status: "A", added: ['const key = Deno.env.get("STRIPE_SECRET_KEY");'] },
      { path: "supabase/functions/legacy/index.ts", status: "D", removed: ["Deno.serve(() => new Response())"] },
    ]);
    expect(ids(result)).toEqual(
      expect.arrayContaining(["security.write-endpoint", "compat.endpoint-removed", "config.new-env", "testing.untested"]),
    );
    expect(result.floors).toMatchObject({ security: 10, compatibility: 15, testing: 10, migration: 10 });
    expect(result.signals.find((x: { id: string }) => x.id === "config.new-env").message).toContain("Supabase secret");
    const platformEnv = scan([{ path: "supabase/functions/x/index.ts", added: ['const url = Deno.env.get("SUPABASE_URL");'] }]);
    expect(ids(platformEnv)).not.toContain("config.new-env");
    expect(result.overrideLevel).toBe("HIGH");
  });

  it("앱 코드의 비밀 키·비공개 환경변수", () => {
    const result = scan([
      {
        path: "src/lib/admin.ts",
        added: [
          "// service_role 키는 여기 두지 않는다",
          "const k = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;",
          "const t = process.env.API_TOKEN;",
        ],
      },
    ]);
    expect(ids(result)).toEqual(expect.arrayContaining(["secret.client", "secret.public-env", "config.non-public-env"]));
    expect(result.signals.find((x: { id: string }) => x.id === "secret.client").where).toEqual(["src/lib/admin.ts:2"]);
    expect(result.overrideLevel).toBe("CRITICAL");
  });

  it("supabase config.toml 의 env() 참조는 비밀값이 아니다", () => {
    const result = scan([{ path: "supabase/config.toml", added: ['secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"'] }]);
    expect(ids(result)).not.toContain("secret.suspect");
  });

  it("서명 키 파일 커밋은 CRITICAL", () => {
    expect(scan([{ path: "credentials/upload.jks", status: "A" }]).overrideLevel).toBe("CRITICAL");
  });

  it("화면 경로 삭제는 딥링크 호환성, 기기 저장 변경은 마이그레이션 신호", () => {
    const result = scan([
      { path: "src/app/decks/[id].tsx", status: "D", removed: ["export default function Deck() {}"] },
      { path: "src/features/decks/store.ts", added: ['await AsyncStorage.setItem("decks:v2", json);'] },
      { path: "test/decks.test.ts", added: ['it("x", () => {})'] },
    ]);
    expect(ids(result)).toEqual(expect.arrayContaining(["compat.route-removed", "compat.device-storage"]));
    expect(result.floors.migration).toBe(10);
  });

  it("SQL 문자열 조합은 HIGH", () => {
    const result = scan([{ path: "supabase/functions/report/index.ts", added: ["  return sql.query(`select * from todos where id = ${id}`);"] }]);
    expect(ids(result)).toContain("security.sql-interpolation");
    expect(result.overrideLevel).toBe("HIGH");
  });

  it("워크플로·리스크 규칙 변경", () => {
    const infra = scan([{ path: ".github/workflows/deploy.yml", added: ["x"] }]);
    expect(infra.overrideLevel).toBe("HIGH");
    expect(infra.floors.scope).toBe(20);
    const self = scan([{ path: "scripts/risk/scan.mjs", added: ["x"] }]);
    expect(self.overrideLevel).toBe("VERY_HIGH");
  });

  it("의존성 추가와 메이저 업그레이드", () => {
    const result = scan([{ path: "package.json", added: ["x"] }], {
      base: { "package.json": JSON.stringify({ dependencies: { zod: "3.0.0" } }) },
      head: { "package.json": JSON.stringify({ dependencies: { zod: "^4.1.0", "date-fns": "^4.0.0" } }) },
    });
    expect(ids(result)).toEqual(expect.arrayContaining(["deps.added", "deps.major"]));
    const patch = scan([{ path: "package.json", added: ["x"] }], {
      base: { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.117.0" } }) },
      head: { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.117.3" } }) },
    });
    expect(ids(patch)).toContain("deps.updated");
    expect(patch.floors.security).toBe(5);
    expect(result.floors).toMatchObject({ security: 5, compatibility: 10 });
    expect(ids(result)).not.toContain("native.dependency");
  });

  it("네이티브 의존성은 추가·변경·제거 모두 새 빌드가 필요한 HIGH", () => {
    const result = scan([{ path: "package.json", added: ["x"] }], {
      base: { "package.json": JSON.stringify({ dependencies: { "expo-camera": "~57.0.1", "react-native-maps": "1.0.0" } }) },
      head: { "package.json": JSON.stringify({ dependencies: { "expo-camera": "~57.0.2", "expo-location": "~57.0.0" } }) },
    });
    const native = result.signals.filter((x: { id: string }) => x.id === "native.dependency").map((x: { message: string }) => x.message);
    expect(native.join("\n")).toMatch(/expo-camera[\s\S]*expo-location[\s\S]*react-native-maps/);
    expect(result.overrideLevel).toBe("HIGH");
    expect(result.nativeChanged).toBe(true);
  });

  it("테스트를 지우거나 skip 하면 Testing 이 오른다", () => {
    const result = scan([
      { path: "test/a.test.ts", removed: ['it("a", () => {})', 'it("b", () => {})'], added: ['it.skip("a", () => {})'] },
    ]);
    expect(ids(result)).toEqual(expect.arrayContaining(["testing.tests-removed", "testing.suppression"]));
    expect(result.floors.testing).toBe(15);
  });
});

describe("모바일 규칙", () => {
  const app = (expo: Record<string, unknown>) => JSON.stringify({ expo });
  const base = { name: "a", scheme: "a", ios: { bundleIdentifier: "com.a" }, android: { package: "com.a" }, plugins: ["expo-router"] };

  it("app.json: 식별자·scheme·권한·플러그인·평문 HTTP·OTA 설정", () => {
    const kinds = (head: Record<string, unknown>) => analyzeAppConfig(app(base), app(head)).map((x: { kind: string }) => x.kind);
    expect(kinds(base)).toEqual([]);
    expect(kinds({ ...base, ios: { bundleIdentifier: "com.b" } })).toEqual(["identity", "native"]);
    expect(kinds({ ...base, scheme: "b" })).toEqual(["scheme", "native"]);
    expect(kinds({ ...base, ios: { ...base.ios, infoPlist: { NSCameraUsageDescription: "x" } } })).toEqual(["permission", "native"]);
    expect(kinds({ ...base, android: { ...base.android, permissions: ["CAMERA"] } })).toEqual(["permission", "native"]);
    expect(kinds({ ...base, plugins: ["expo-router", ["expo-camera", {}]] })).toEqual(["plugin", "native"]);
    expect(kinds({ ...base, android: { ...base.android, usesCleartextTraffic: true } })).toEqual(["cleartext", "native"]);
    expect(kinds({ ...base, runtimeVersion: "1.0.0" })).toEqual(["updates", "native"]);
  });

  it("app.json 변경은 네이티브 변경(HIGH), 식별자 변경은 CRITICAL", () => {
    const result = scan([{ path: "app.json", added: ["x"] }], {
      base: { "app.json": app(base) },
      head: { "app.json": app({ ...base, android: { package: "com.b" } }) },
    });
    expect(ids(result)).toEqual(expect.arrayContaining(["native.identity", "native.config"]));
    expect(result.overrideLevel).toBe("CRITICAL");
    expect(result.nativeChanged).toBe(true);
  });

  it("fingerprint 가 바뀌면 HIGH, 바뀌지 않았으면 신호 없음", () => {
    const changed = scan([{ path: "src/app/index.tsx", added: ["x"] }], { fingerprint: { changed: true, sources: ["expoConfig"] } });
    expect(ids(changed)).toContain("native.fingerprint");
    expect(changed.overrideLevel).toBe("HIGH");
    const same = scan([{ path: "src/app/index.tsx", added: ["x"] }], { fingerprint: { changed: false } });
    expect(ids(same)).not.toContain("native.fingerprint");
    expect(same.nativeChanged).toBe(false);
  });

  it("네이티브 패키지 추정", () => {
    expect(["expo", "expo-camera", "react-native-maps", "@shopify/react-native-skia", "@sentry/react-native"].every(isNativePackage)).toBe(true);
    expect(["zod", "react-native-web", "@expo/vector-icons", "date-fns"].some(isNativePackage)).toBe(false);
  });

  it("RLS 없는 새 public 테이블은 VERY HIGH", () => {
    expect(tablesWithoutRls(["create table public.decks (id uuid primary key);", "create table private.jobs (id int);"])).toEqual(["decks"]);
    expect(tablesWithoutRls(["create table decks (id uuid);\nalter table decks enable row level security;"])).toEqual([]);
    const sql = "create table notes (id uuid primary key);";
    const result = scan([{ path: "supabase/migrations/20260101000000_notes.sql", status: "A", added: [sql] }], {
      head: { "supabase/migrations/20260101000000_notes.sql": sql },
    });
    expect(ids(result)).toContain("security.rls-missing");
    expect(result.overrideLevel).toBe("VERY_HIGH");
  });

  it("모두에게 열린 쓰기 정책과 search_path 없는 security definer", () => {
    const sql = [
      "create table notes (id uuid primary key); alter table notes enable row level security;",
      'create policy "read" on notes for select using (true);',
      'create policy "write" on notes for insert with check (true);',
      "create function f() returns void language sql security definer as $$ select 1 $$;",
    ].join("\n");
    const result = scan([{ path: "supabase/migrations/20260101000000_x.sql", status: "A", added: sql.split("\n") }], {
      head: { "supabase/migrations/20260101000000_x.sql": sql },
    });
    const open = result.signals.filter((x: { id: string }) => x.id === "security.rls-open");
    expect(open).toHaveLength(1);
    expect(open[0].where[0]).toContain("insert");
    expect(ids(result)).toContain("security.definer");
  });
});

const baseScan = () =>
  scan([{ path: "supabase/functions/todos/index.ts", status: "A", added: ["Deno.serve(() => new Response())"] }]);

const review = (scores: Partial<Record<string, number>>, extra: Record<string, unknown> = {}) => ({
  summary: "할 일 추가 API",
  verdict: "approve",
  findings: [],
  risk: {
    factors: Object.fromEntries(
      ["security", "scope", "compatibility", "testing", "migration"].map((f) => [
        f,
        { score: scores[f] ?? 0, evidence: `${f} 근거`, confidence: "verified" },
      ]),
    ),
    overrides: [],
    drivers: [],
    affected: [],
    mitigations: [],
    unknowns: [],
    ...extra,
  },
});

describe("finalize", () => {
  it("AI 점수가 floor 보다 낮으면 floor 를 쓴다", () => {
    const a = finalize({ scan: baseScan(), review: review({ security: 0, scope: 5 }), sha: "s1" });
    expect(a.factors.security).toMatchObject({ score: 10, llm: 0, floor: 10 });
    expect(a.factors.security.notes[0]).toContain("최저치");
  });

  it("확인 불가(unknown)는 최소 10", () => {
    const r = review({ compatibility: 0 });
    (r.risk.factors as Record<string, { confidence: string }>).compatibility.confidence = "unknown";
    const a = finalize({ scan: baseScan(), review: r, sha: "s1" });
    expect(a.factors.compatibility.score).toBe(10);
  });

  it("근거 없는 AI override 는 버리고, 근거 있는 것은 올린다", () => {
    const r = review({}, {
      overrides: [
        { level: "CRITICAL", condition: "인가 우회", evidence: "" },
        { level: "VERY_HIGH", condition: "보안 경계", evidence: "supabase/functions/todos/index.ts:1 인증 없음" },
      ],
    });
    const a = finalize({ scan: baseScan(), review: r, sha: "s1" });
    expect(a.level).toBe("VERY_HIGH");
  });

  it("AI 평가가 없으면 런타임 변경은 최소 MEDIUM", () => {
    const a = finalize({ scan: scan([{ path: "src/lib/x.ts", added: ["a"] }]), review: null, sha: "s1" });
    expect(a.llmAssessed).toBe(false);
    expect(a.level).toBe("MEDIUM");
  });
});

describe("applyPolicy", () => {
  const assessment = (level: string, extra: Record<string, unknown> = {}) => ({
    ...finalize({ scan: baseScan(), review: review({ security: 10 }), sha: "abc" }),
    level,
    ...extra,
  });
  const body = (rollback = "", verify = "") =>
    `## 무엇을\n할 일\n\n## 롤백 계획\n<!-- 안내 -->\n${rollback}\n\n## 배포 후 확인\n${verify}\n`;

  it("섹션이 채워졌는지", () => {
    expect(sectionFilled(body("앱 롤백(rollback.yml)만으로 복구, 스키마 변경 없음"), "롤백 계획")).toBe(true);
    expect(sectionFilled(body("없음"), "롤백 계획")).toBe(false);
    expect(sectionFilled(body(""), "롤백 계획")).toBe(false);
  });

  it("MEDIUM 은 조건 없음", () => {
    expect(applyPolicy(assessment("MEDIUM"), { prBody: "", ciOk: true }).state).toBe("success");
  });

  it("HIGH 는 롤백 계획이 필요", () => {
    const a = assessment("HIGH");
    expect(applyPolicy(a, { prBody: body(), ciOk: true }).state).toBe("failure");
    expect(applyPolicy(a, { prBody: body("이전 배포로 promote, DB 변경 없음"), ciOk: true }).state).toBe("success");
  });

  it("CRITICAL 도 롤백 계획·배포 후 확인만 본다(사람의 수락은 merge 버튼이다)", () => {
    const a = assessment("CRITICAL");
    const filled = body("expand/contract 2단계, 실패 시 pre-deploy 스냅샷 복구", "/api/health 와 가입 흐름 수동 확인");
    expect(applyPolicy(a, { prBody: body(), ciOk: true }).state).toBe("failure");
    const checks = applyPolicy(a, { prBody: filled, ciOk: true });
    expect(checks.state).toBe("success");
    expect(checks.requirements.map((r) => r.id)).toEqual(["rollback", "verify"]);
  });

  it("파괴적 마이그레이션 + 롤백 계획 없음 → CRITICAL", () => {
    const sql = "drop table legacy;";
    const s = scan([{ path: "supabase/migrations/9.sql", status: "A", added: [sql] }], { head: { "supabase/migrations/9.sql": sql } });
    const a = finalize({ scan: s, review: review({ migration: 20 }), sha: "abc" });
    const checks = applyPolicy(a, { prBody: body(), ciOk: true });
    expect(checks.level).toBe("CRITICAL");
    expect(checks.reasons[0]).toContain("롤백 계획");
  });

  it("빠진 확인 사항 수를 코멘트 둘째 줄에 보여 준다", () => {
    const a = assessment("HIGH");
    const checks = applyPolicy(a, { prBody: body(), ciOk: true });
    const line = renderSummary({ assessment: a, checks, ci: { test: "success", ok: true } }).split("\n")[2];
    expect(line).toContain("merge 전 확인 **1개 빠짐 ⚠️**");
  });

  it("CI 실패면 확인 사항으로 남긴다", () => {
    expect(applyPolicy(assessment("LOW"), { prBody: "", ciOk: false }).state).toBe("failure");
  });
});

describe("previewCell", () => {
  it("상태·웹·앱 링크·시각을 한 칸에", () => {
    expect(
      previewCell({
        preview: "success",
        webUrl: "https://app--pr-3.expo.app",
        updateUrl: "https://expo.dev/accounts/me/projects/app/updates/abc",
        previewAt: "2026-10-06T03:06:00Z",
      }),
    ).toBe("✅ · [웹](https://app--pr-3.expo.app) · [앱 QR](https://expo.dev/accounts/me/projects/app/updates/abc) · 10/6 12:06 KST");
    expect(previewCell({ preview: "skipped" })).toBe("⏭️");
  });
});

describe("previousReview (AI 리뷰 PR 당 1회)", () => {
  it("저장된 평가에서 다시 만든 리뷰로 finalize 하면 같은 점수가 나온다", () => {
    const first = finalize({ scan: baseScan(), review: review({ security: 10, scope: 10, testing: 5 }), sha: "aaa" });
    const again = finalize({ scan: baseScan(), review: previousReview(first), sha: "bbb" });
    expect(again.total).toBe(first.total);
    expect(again.level).toBe(first.level);
    expect(again.llmAssessed).toBe(true);
    expect(previousReview({ ...first, review: null })).toBeNull();
  });

  it("이어 쓴 리뷰는 어느 커밋을 본 것인지 코멘트에 남긴다", () => {
    const a = { ...finalize({ scan: baseScan(), review: review({ security: 10 }), sha: "bbbbbbb1" }), reviewSha: "aaaaaaa1" };
    const checks = applyPolicy(a, { prBody: "", ciOk: true });
    const text = renderSummary({ assessment: a, checks, ci: { test: "success", ok: true } });
    expect(text).toContain("`aaaaaaa` 기준(PR 당 1회)");
  });
});

describe("renderSummary", () => {
  it("결론이 첫 줄에 있고 데이터가 왕복된다", () => {
    const a = finalize({ scan: baseScan(), review: review({ security: 10, scope: 10, testing: 10, migration: 5 }), sha: "abcdef1234" });
    const checks = applyPolicy(a, { prBody: "", ciOk: true });
    const ci = { test: "success", preview: "success", native: "true", nativeSources: ["expoConfig"], ok: true };
    const text = renderSummary({ assessment: a, checks, ci, previous: { sha: "000", total: 30, level: "MEDIUM" } });
    const lines = text.split("\n");
    expect(lines[0]).toBe("<!-- pr-summary -->");
    expect(lines[1]).toContain(`Risk ${a.total}/100`);
    expect(lines[2]).toContain("이전 커밋 30");
    expect(lines[2]).toContain("merge 전 확인 **모두 채움 ✅**");
    expect(text).toContain("새 빌드 필요");
    expect(decodeData(text).assessment.total).toBe(a.total);
  });
});

describe("runScan (실제 git)", () => {
  let dir: string;
  const cwd = process.cwd();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "risk-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    await mkdir(path.join(dir, "src/lib"), { recursive: true });
    await mkdir(path.join(dir, "supabase/migrations"), { recursive: true });
    await mkdir(path.join(dir, ".github/risk"), { recursive: true });
    await writeFile(path.join(dir, ".github/risk/config.json"), JSON.stringify(config));
    await writeFile(path.join(dir, "src/lib/users.ts"), 'export const q = supabase.from("profiles").select("email");\n');
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "feature");
    await writeFile(path.join(dir, "supabase/migrations/20260101000000_drop_email.sql"), "alter table profiles drop column email;\n");
    git("add", "-A");
    git("commit", "-qm", "drop email");
  });

  afterAll(async () => {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("main 의 코드가 쓰는 컬럼 삭제를 CRITICAL 로 잡고 파일을 남긴다", async () => {
    process.chdir(dir);
    const { scan: result } = runScan({ base: "main", head: "feature", out: path.join(dir, ".review") });
    process.chdir(cwd);
    expect(result.overrideLevel).toBe("CRITICAL");
    const facts = await readFile(path.join(dir, ".review/facts.md"), "utf8");
    expect(facts).toContain("migration.referenced");
    expect(await readFile(path.join(dir, ".review/pr.diff"), "utf8")).toContain("drop column email");
  });

  it("CI 의 fingerprint 결과가 있으면 네이티브 신호를 더한다(형식이 틀리면 무시)", async () => {
    process.chdir(dir);
    const good = path.join(dir, "fp.json");
    const bad = path.join(dir, "bad.json");
    await writeFile(good, JSON.stringify({ changed: true, sources: ["expoConfig"] }));
    await writeFile(bad, JSON.stringify({ changed: "yes" }));
    const withFp = runScan({ base: "main", head: "feature", out: path.join(dir, ".review"), fingerprintPath: good }).scan;
    const withBad = runScan({ base: "main", head: "feature", out: path.join(dir, ".review"), fingerprintPath: bad }).scan;
    process.chdir(cwd);
    expect(withFp.signals.map((x: { id: string }) => x.id)).toContain("native.fingerprint");
    expect(withBad.signals.map((x: { id: string }) => x.id)).not.toContain("native.fingerprint");
  });
});
