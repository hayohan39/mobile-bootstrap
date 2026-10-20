import { describe, expect, it } from "vitest";

import { buildLink, hasLiveBuild, latestGroup, monitorIdle, nextRollout, parsePlatforms, parseSentryHealth, renderReport } from "../scripts/release.mjs";

describe("release", () => {
  it("플랫폼 목록", () => {
    expect(parsePlatforms()).toEqual(["android"]);
    expect(parsePlatforms("all")).toEqual(["android", "ios"]);
    expect(parsePlatforms("ios, android,ios")).toEqual(["ios", "android"]);
    expect(() => parsePlatforms("web")).toThrow();
    expect(() => parsePlatforms("")).toThrow();
  });

  it("같은 runtimeVersion 의 빌드가 있거나 만드는 중이면 OTA 로 갈 수 있다", () => {
    expect(hasLiveBuild([{ status: "FINISHED" }])).toBe(true);
    expect(hasLiveBuild([{ status: "in-queue" }])).toBe(true);
    expect(hasLiveBuild([{ status: "errored" }, { status: "canceled" }])).toBe(false);
    expect(hasLiveBuild(null)).toBe(false);
  });

  it("update:list 결과에서 최근 그룹(되돌리기 표식 제외)과 롤아웃 비율을 읽는다", () => {
    const list = {
      currentPage: [
        { group: "r", isRollBackToEmbedded: true, runtimeVersion: "a" },
        { group: "g2", runtimeVersion: "a", rolloutPercentage: 10, message: "msg" },
      ],
    };
    expect(latestGroup(list)).toEqual({ group: "g2", runtimeVersion: "a", rolloutPercentage: 10, message: "msg", isRollBackToEmbedded: false });
    expect(latestGroup({ currentPage: [] })).toBeNull();
    expect(latestGroup(null)).toBeNull();
  });

  it("롤아웃 다음 단계: 건강하면 10→50→100, 나쁘면 멈춤, 데이터가 적으면 유지", () => {
    const good = { crashFreeRate: 0.999, sessions: 500 };
    expect(nextRollout(10, good)).toMatchObject({ action: "advance", to: 50 });
    expect(nextRollout(50, good)).toMatchObject({ action: "advance", to: 100 });
    expect(nextRollout(100, good)).toEqual({ action: "done" });
    expect(nextRollout(null, good)).toEqual({ action: "done" });
    expect(nextRollout(10, { crashFreeRate: 0.95, sessions: 500 })).toMatchObject({ action: "halt" });
    expect(nextRollout(10, { crashFreeRate: 0.993, sessions: 500 })).toMatchObject({ action: "hold" });
    expect(nextRollout(10, { crashFreeRate: 0.5, sessions: 3 })).toMatchObject({ action: "hold" });
    expect(nextRollout(10, null)).toMatchObject({ action: "hold" });
    expect(nextRollout(25, good)).toMatchObject({ action: "advance", to: 50 });
  });

  it("Sentry 응답과 링크·리포트", () => {
    expect(parseSentryHealth({ groups: [{ totals: { "crash_free_rate(session)": 0.998, "sum(session)": 42 } }] })).toEqual({ crashFreeRate: 0.998, sessions: 42 });
    expect(parseSentryHealth({ groups: [] })).toEqual({ crashFreeRate: null, sessions: 0 });
    expect(buildLink({ owner: "me", slug: "app" }, "b1")).toBe("https://expo.dev/accounts/me/projects/app/builds/b1");
    expect(buildLink({ owner: null, slug: "app" }, "b1")).toBe("");
    expect(renderReport("스테이징 배포", [{ platform: "android", icon: "📦", text: "OTA", link: "https://x" }])).toBe(
      "### 스테이징 배포\n\n- 📦 **android** OTA — [EAS](https://x)",
    );
  });

  it("모든 플랫폼에 진행 중인 롤아웃이 없을 때만 감시를 멈춘다", () => {
    const idle = { platform: "android", icon: "➖", idle: true, text: "없음" };
    const holding = { platform: "ios", icon: "⏸️", text: "50% 유지" };
    expect(monitorIdle([idle, { ...idle, platform: "ios" }])).toBe(true);
    expect(monitorIdle([idle, holding])).toBe(false);
    expect(monitorIdle([])).toBe(false);
  });
});
