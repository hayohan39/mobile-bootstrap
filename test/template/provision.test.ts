// 템플릿 전용 테스트. 새 프로젝트에서는 init-project 가 이 디렉터리를 지운다.
import { describe, expect, it } from "vitest";

import { pickPublishableKey, redirectAllowList, sessionPoolerUrl } from "../../scripts/provision.mjs";

describe("provision", () => {
  it("publishable 키를 우선하고 없으면 legacy anon", () => {
    expect(pickPublishableKey([{ name: "anon", api_key: "a" }, { type: "publishable", name: "default", api_key: "sb_publishable_x" }])).toBe("sb_publishable_x");
    expect(pickPublishableKey([{ name: "service_role", api_key: "s" }, { name: "anon", api_key: "a" }])).toBe("a");
    expect(pickPublishableKey([{ name: "service_role", api_key: "s" }])).toBeNull();
    expect(pickPublishableKey(null)).toBeNull();
  });

  it("Session pooler(5432) 연결 문자열을 만들고 비밀번호를 인코딩한다", () => {
    const pooler = [
      { database_type: "READ_REPLICA", db_host: "replica.example", db_user: "postgres.ref" },
      { database_type: "PRIMARY", db_host: "aws-0-ap-northeast-2.pooler.supabase.com", db_user: "postgres.ref", db_port: 6543, db_name: "postgres" },
    ];
    expect(sessionPoolerUrl(pooler, "ref", "p/w@1")).toBe(
      "postgresql://postgres.ref:p%2Fw%401@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres",
    );
    expect(sessionPoolerUrl({ db_host: "h" }, "abc", "x")).toBe("postgresql://postgres.abc:x@h:5432/postgres");
    expect(sessionPoolerUrl([], "abc", "x")).toBeNull();
  });

  it("Auth 리디렉트 허용 목록에 앱 scheme 을 한 번만 더한다", () => {
    expect(redirectAllowList("", "myapp")).toBe("myapp://,myapp://**");
    expect(redirectAllowList("https://a.com, myapp://", "myapp")).toBe("https://a.com,myapp://,myapp://**");
  });
});
