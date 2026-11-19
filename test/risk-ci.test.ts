import { afterEach, describe, expect, it, vi } from "vitest";
import { collectCi } from "../scripts/risk/cli.mjs";

// CI 실행의 job 목록으로 ci.json 을 만든다(pr-review.yml 의 Collect CI results).
function stubJobs(jobs: { name: string; conclusion: string }[]) {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("GITHUB_REPOSITORY", "owner/app");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ jobs: jobs.map((j) => ({ ...j, status: "completed" })) }), { status: 200 })),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("collectCi — 네이티브 변경 판정 job", () => {
  it("fingerprint 가 test job 의 step 이면 test 의 결과를 쓴다", async () => {
    stubJobs([{ name: "test", conclusion: "failure" }, { name: "preview", conclusion: "skipped" }]);
    const ci = await collectCi({ runId: 1, metaDir: null });
    expect(ci.fingerprint).toBe("failure");
    expect(ci.ok).toBe(false);
  });

  it("test 가 통과하면 fingerprint job 이 없어도 CI 통과다", async () => {
    stubJobs([{ name: "test", conclusion: "success" }, { name: "preview", conclusion: "success" }]);
    const ci = await collectCi({ runId: 1, metaDir: null });
    expect(ci.fingerprint).toBe("success");
    expect(ci.ok).toBe(true);
  });

  it("옛 프로젝트처럼 fingerprint job 이 따로 있으면 그 결과를 쓴다", async () => {
    stubJobs([{ name: "test", conclusion: "success" }, { name: "fingerprint", conclusion: "failure" }]);
    const ci = await collectCi({ runId: 1, metaDir: null });
    expect(ci.fingerprint).toBe("failure");
    expect(ci.ok).toBe(false);
  });
});
