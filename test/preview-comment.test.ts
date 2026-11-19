import { describe, expect, it } from "vitest";

import { appCell, parsePreview, renderPreview } from "../scripts/preview-comment.mjs";

describe("preview-comment 앱 미리보기 칸", () => {
  it("app-preview 라벨이 없으면 꺼짐과 켜는 법", () => {
    expect(appCell({ native: "false", update: "skipped", appPreview: false })).toMatch(/꺼짐.*app-preview/);
    expect(appCell({ pending: true, native: "false", appPreview: false })).toMatch(/꺼짐/);
  });

  it("라벨이 있으면 결과(QR 링크), 네이티브 변경이면 새 빌드 필요", () => {
    expect(appCell({ native: "false", update: "success", updateUrl: "https://expo.dev/x", appPreview: true })).toBe("✅ [QR·열기](https://expo.dev/x)");
    expect(appCell({ native: "true", update: "skipped", appPreview: true })).toBe("🧱 새 빌드 필요");
    expect(appCell({ native: "true", update: "skipped", appPreview: false })).toBe("🧱 새 빌드 필요");
    expect(appCell({ pending: true, native: "false", appPreview: true })).toBe("⏳ 준비 중");
  });

  it("코멘트 표에 웹 링크와 앱 꺼짐이 함께 나온다", () => {
    const body = renderPreview({ project: "fullset", sha: "abcdef1234", native: "false", web: "success", webUrl: "https://x.expo.app", update: "skipped", appPreview: false });
    expect(body).toContain("✅ [열기](https://x.expo.app)");
    expect(body).toContain("app-preview");
  });
});

describe("parsePreview — pr-status 가 프리뷰 코멘트를 읽는다", () => {
  const base = { project: "app", sha: "abcdef1234567890", now: new Date("2026-11-19T00:00:00Z") };

  it("네이티브 변경 없음 + 웹·앱 링크", () => {
    const body = renderPreview({ ...base, native: "false", web: "success", webUrl: "https://app--abc123.expo.app", update: "success", updateUrl: "https://expo.dev/preview/update?x=1" });
    expect(parsePreview(body)).toEqual({ sha: "abcdef1", native: "false", webUrl: "https://app--abc123.expo.app", updateUrl: "https://expo.dev/preview/update?x=1", pending: false });
  });

  it("네이티브 변경 있음", () => {
    const body = renderPreview({ ...base, native: "true", sources: ["expoConfig"], web: "success", webUrl: "https://app--abc123.expo.app" });
    const p = parsePreview(body);
    expect(p.native).toBe("true");
    expect(p.updateUrl).toBeNull();
  });

  it("준비 중이면 pending, 링크 없음", () => {
    const p = parsePreview(renderPreview({ ...base, pending: true, native: "false" }));
    expect(p.pending).toBe(true);
    expect(p.webUrl).toBeNull();
  });

  it("종합 코멘트 안내 문구가 없다(pr-review 제거)", () => {
    expect(renderPreview({ ...base, native: "false", web: "success", runUrl: "https://github.com/o/r/actions/runs/1" })).not.toContain("종합 코멘트");
  });
});
