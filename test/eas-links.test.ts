import { describe, expect, it } from "vitest";

import { project, updateLinks, webUrl } from "../scripts/eas-links.mjs";

describe("eas-links", () => {
  it("app.json 에서 owner·slug·projectId 를 읽는다", () => {
    const app = JSON.stringify({ expo: { owner: "me", slug: "app", extra: { eas: { projectId: "p1" } } } });
    expect(project(app)).toEqual({ owner: "me", slug: "app", projectId: "p1" });
    expect(project(JSON.stringify({ expo: {} }))).toEqual({ owner: null, slug: null, projectId: null });
  });

  it("eas update --json 결과에서 대시보드 링크를 만든다", () => {
    const out = [
      { id: "u1", group: "g1", platform: "ios", runtimeVersion: "abc" },
      { id: "u2", group: "g1", platform: "android", runtimeVersion: "def" },
    ];
    expect(updateLinks(out, { owner: "me", slug: "app", projectId: "p1" })).toEqual({
      group: "g1",
      runtime_version: "abc",
      update_url: "https://expo.dev/accounts/me/projects/app/updates/g1",
    });
    expect(updateLinks(out, { owner: null, slug: null, projectId: "p1" }).update_url).toBe("https://expo.dev/projects/p1/updates/g1");
    expect(updateLinks(null, { owner: "me", slug: "app", projectId: null })).toEqual({ group: "", runtime_version: "", update_url: "" });
  });

  it("eas deploy 출력에서 별칭 주소를 고른다", () => {
    const log = "Deployment: https://app--abc123.expo.app\nAlias: https://app--pr-7.expo.app/\nDashboard https://expo.dev/x";
    expect(webUrl(log, "pr-7").web_url).toBe("https://app--pr-7.expo.app");
    expect(webUrl(log).web_url).toBe("https://app--abc123.expo.app");
    expect(webUrl("https://app.expo.app").web_url).toBe("https://app.expo.app");
    expect(webUrl("nothing").web_url).toBe("");
  });
});
