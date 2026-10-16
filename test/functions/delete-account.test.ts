import { describe, expect, it, vi } from "vitest";

import { type DeleteAccountDeps, handleDeleteAccount } from "../../supabase/functions/delete-account/handler";

function deps(overrides: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps {
  return {
    getUser: vi.fn(async (token: string) => (token === "good" ? { id: "u1", providers: ["email"] } : null)),
    deleteUser: vi.fn(async () => {}),
    log: vi.fn(),
    ...overrides,
  };
}

const post = (token?: string, body?: unknown) =>
  new Request("https://x/functions/v1/delete-account", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("delete-account", () => {
  it("로그인한 본인을 지운다", async () => {
    const d = deps();
    const res = await handleDeleteAccount(post("good"), d);
    expect(res.status).toBe(200);
    expect(d.deleteUser).toHaveBeenCalledWith("u1");
  });

  it("토큰이 없거나 틀리면 401, 아무것도 지우지 않는다", async () => {
    const d = deps();
    expect((await handleDeleteAccount(post(), d)).status).toBe(401);
    expect((await handleDeleteAccount(post("bad"), d)).status).toBe(401);
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("POST 가 아니면 405, OPTIONS 는 CORS", async () => {
    expect((await handleDeleteAccount(new Request("https://x", { method: "GET" }), deps())).status).toBe(405);
    const options = await handleDeleteAccount(new Request("https://x", { method: "OPTIONS" }), deps());
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("Apple 계정이면 토큰을 폐기하고, 폐기가 실패해도 삭제는 한다", async () => {
    const revokeApple = vi.fn(async () => {
      throw new Error("apple down");
    });
    const d = deps({ getUser: async () => ({ id: "u2", providers: ["apple"] }), revokeApple });
    const res = await handleDeleteAccount(post("good", { apple_authorization_code: "code-1" }), d);
    expect(revokeApple).toHaveBeenCalledWith("code-1");
    expect(d.deleteUser).toHaveBeenCalledWith("u2");
    expect(res.status).toBe(200);
    expect(d.log).toHaveBeenCalledWith("error", "Apple 토큰 폐기 실패", expect.anything());
  });

  it("Apple 계정인데 코드가 없으면 경고만 남기고 삭제한다", async () => {
    const d = deps({ getUser: async () => ({ id: "u3", providers: ["apple"] }), revokeApple: vi.fn() });
    await handleDeleteAccount(post("good"), d);
    expect(d.revokeApple).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith("warn", "Apple 토큰을 폐기하지 못함", { reason: "no_code" });
    expect(d.deleteUser).toHaveBeenCalled();
  });

  it("삭제가 실패하면 500 과 내부 정보 없는 오류", async () => {
    const d = deps({ deleteUser: async () => { throw new Error("db password=secret"); } });
    const res = await handleDeleteAccount(post("good"), d);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });
});
