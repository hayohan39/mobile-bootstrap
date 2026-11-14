import { describe, expect, it } from "vitest";

import { appCell, renderPreview } from "../scripts/preview-comment.mjs";

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
