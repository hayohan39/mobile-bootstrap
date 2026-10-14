import { describe, expect, it } from "vitest";

import { sentryOptions } from "@/lib/sentry";

describe("sentryOptions", () => {
  it("DSN 이 없으면 끈다", () => {
    expect(sentryOptions(undefined, { channel: "production" }).enabled).toBe(false);
  });

  it("채널을 환경 이름으로 쓰고 개인정보는 보내지 않는다", () => {
    const options = sentryOptions("https://key@o0.ingest.sentry.io/1", { channel: "staging" });
    expect(options).toMatchObject({ enabled: true, environment: "staging", sendDefaultPii: false });
  });

  it("채널이 없으면(개발 빌드) development", () => {
    expect(sentryOptions(undefined, { channel: null }).environment).toBe("development");
  });
});
