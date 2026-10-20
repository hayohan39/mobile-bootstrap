import { describe, expect, it } from "vitest";

import { codeChanged, isDocs } from "../scripts/ci-changes.mjs";

describe("ci-changes", () => {
  it("문서만 바뀌면 앱 코드 변경이 아니다", () => {
    expect(codeChanged(["docs/game-design.md", "README.md", "CLAUDE.md", ".github/pull_request_template.md"])).toBe(false);
    expect(codeChanged(["LICENSE"])).toBe(false);
    expect(codeChanged([])).toBe(false);
  });

  it("코드·설정·워크플로가 하나라도 있으면 앱 코드 변경이다", () => {
    expect(codeChanged(["docs/a.md", "src/app/index.tsx"])).toBe(true);
    expect(codeChanged(["app.json"])).toBe(true);
    expect(codeChanged(["supabase/migrations/20261020000000_x.sql"])).toBe(true);
    expect(codeChanged([".github/workflows/ci.yml"])).toBe(true);
    expect(codeChanged([".maestro/smoke.yaml"])).toBe(true);
  });

  it("src/·assets/ 안의 .md 는 번들에 들어갈 수 있어 문서로 보지 않는다", () => {
    expect(isDocs("src/features/game/notes.md")).toBe(false);
    expect(isDocs("assets/credits.md")).toBe(false);
    expect(isDocs("supabase/functions/README.md")).toBe(true);
  });
});
