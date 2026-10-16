import { describe, expect, it } from "vitest";

import { compareVersions, DEFAULT_CONFIG, isEnabled, needsUpdate, parseConfig } from "@/lib/app-config";

describe("app-config", () => {
  it("버전을 숫자로 비교한다", () => {
    expect(compareVersions("1.10.0", "1.9.3")).toBeGreaterThan(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });

  it("행을 설정으로 읽고 모양이 틀린 값은 버린다", () => {
    const config = parseConfig([
      { key: "min_version", value: { ios: "1.2.0", android: "oops" } },
      { key: "features", value: { chat: false, beta: "yes" } },
      { key: "maintenance", value: { enabled: true, message: "점검 중" } },
      { key: "unknown", value: 1 },
    ]);
    expect(config).toEqual({ minVersion: { ios: "1.2.0" }, features: { chat: false }, maintenance: { enabled: true, message: "점검 중" } });
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig([{ key: "features", value: [true] }]).features).toEqual({});
  });

  it("최소 버전보다 낮으면 업데이트가 필요하다(설정이 없으면 아니다)", () => {
    const config = parseConfig([{ key: "min_version", value: { android: "1.3.0" } }]);
    expect(needsUpdate(config, "android", "1.2.9")).toBe(true);
    expect(needsUpdate(config, "android", "1.3.0")).toBe(false);
    expect(needsUpdate(config, "ios", "0.1.0")).toBe(false);
  });

  it("킬스위치: 없는 기능은 기본값", () => {
    const config = parseConfig([{ key: "features", value: { chat: false, login_apple: true } }]);
    expect(isEnabled(config, "chat")).toBe(false);
    expect(isEnabled(config, "feed")).toBe(true);
    expect(isEnabled(config, "login_google", false)).toBe(false);
    expect(isEnabled(config, "login_apple", false)).toBe(true);
  });
});

describe("storeUrl", () => {
  it("플랫폼별 스토어 주소, 모르면 null", async () => {
    const { storeUrl } = await import("@/lib/app-config");
    expect(storeUrl("android", { androidPackage: "com.me.app" })).toBe("https://play.google.com/store/apps/details?id=com.me.app");
    expect(storeUrl("ios", { appStoreId: "123" })).toBe("https://apps.apple.com/app/id123");
    expect(storeUrl("ios", { appStoreId: "" })).toBeNull();
    expect(storeUrl("web", { androidPackage: "x" })).toBeNull();
  });
});
