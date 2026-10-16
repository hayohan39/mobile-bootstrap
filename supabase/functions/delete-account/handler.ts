// 계정 삭제 요청 처리(Apple 5.1.1(v), Google Play 계정 삭제 정책). 런타임(Deno)과 무관한 순수 로직이라
// vitest 로 테스트한다(test/functions/delete-account.test.ts). 실제 연결은 index.ts.

export type DeleteAccountDeps = {
  /** 요청의 액세스 토큰으로 사용자를 확인한다. 유효하지 않으면 null. */
  getUser: (accessToken: string) => Promise<{ id: string; providers: string[] } | null>;
  /** 사용자를 지운다(auth.users 삭제 → 연결된 public 테이블은 on delete cascade). */
  deleteUser: (userId: string) => Promise<void>;
  /** Apple 토큰 폐기. 설정되지 않았으면 undefined. */
  revokeApple?: (authorizationCode: string) => Promise<void>;
  log: (level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) => void;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "unauthorized" });
  const user = await deps.getUser(token).catch(() => null);
  if (!user) return json(401, { error: "unauthorized" });

  let code: string | null = null;
  try {
    const body = await req.json();
    const value = body?.apple_authorization_code;
    if (typeof value === "string" && value.length > 0 && value.length <= 2048) code = value;
  } catch {
    // 본문이 없어도 된다(Apple 계정이 아니면).
  }

  // Apple 로 가입한 계정은 Apple 토큰도 폐기해야 한다. 실패해도 삭제는 진행한다(사용자의 삭제 의사가 우선) — 기록만 남긴다.
  if (user.providers.includes("apple")) {
    if (!code || !deps.revokeApple) {
      deps.log("warn", "Apple 토큰을 폐기하지 못함", { reason: code ? "not_configured" : "no_code" });
    } else {
      try {
        await deps.revokeApple(code);
      } catch (error) {
        deps.log("error", "Apple 토큰 폐기 실패", { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  try {
    await deps.deleteUser(user.id);
  } catch (error) {
    deps.log("error", "계정 삭제 실패", { error: error instanceof Error ? error.message : String(error) });
    return json(500, { error: "delete_failed" });
  }
  deps.log("info", "계정 삭제", {});
  return json(200, { deleted: true });
}
