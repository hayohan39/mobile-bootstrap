import { describe, expect, it } from "vitest";

import { ENV_DOCS, optionalEnv, PUBLIC_ENV, requireEnv } from "@/lib/env";

describe("env", () => {
  it("빈 문자열은 없는 값으로 본다", () => {
    expect(optionalEnv("EXPO_PUBLIC_SENTRY_DSN", { EXPO_PUBLIC_SENTRY_DSN: "" })).toBeUndefined();
  });

  it("필수 값이 없으면 발급처를 알려 준다", () => {
    expect(() => requireEnv("EXPO_PUBLIC_SUPABASE_URL", {})).toThrow(ENV_DOCS.EXPO_PUBLIC_SUPABASE_URL);
  });

  it("앱에 노출되는 변수는 모두 EXPO_PUBLIC_ 이고 표와 정적 읽기 목록이 일치한다", () => {
    const names = Object.keys(ENV_DOCS);
    expect(names.every((name) => name.startsWith("EXPO_PUBLIC_"))).toBe(true);
    expect(Object.keys(PUBLIC_ENV).sort()).toEqual(names.sort());
  });
});
