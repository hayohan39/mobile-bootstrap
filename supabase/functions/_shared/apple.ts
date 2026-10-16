// Sign in with Apple 토큰 폐기(계정 삭제 때 Apple 이 요구). authorization code → refresh token → revoke.
// 필요한 Supabase secret: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY(.p8 내용), APPLE_CLIENT_ID(앱 bundle id).
import { importPKCS8, SignJWT } from "npm:jose@5";

export type AppleConfig = { teamId: string; keyId: string; privateKey: string; clientId: string };

export function appleConfigFromEnv(get: (name: string) => string | undefined): AppleConfig | null {
  const teamId = get("APPLE_TEAM_ID");
  const keyId = get("APPLE_KEY_ID");
  const privateKey = get("APPLE_PRIVATE_KEY");
  const clientId = get("APPLE_CLIENT_ID");
  return teamId && keyId && privateKey && clientId ? { teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n"), clientId } : null;
}

async function clientSecret(config: AppleConfig): Promise<string> {
  const key = await importPKCS8(config.privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("https://appleid.apple.com")
    .setSubject(config.clientId)
    .sign(key);
}

export async function revokeAppleAuthorization(config: AppleConfig, authorizationCode: string): Promise<void> {
  const secret = await clientSecret(config);
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: authorizationCode, client_id: config.clientId, client_secret: secret }),
  });
  if (!tokenRes.ok) throw new Error(`Apple token HTTP ${tokenRes.status}`);
  const { refresh_token: refreshToken } = await tokenRes.json();
  if (!refreshToken) throw new Error("Apple refresh token 없음");
  const revokeRes = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, token: refreshToken, token_type_hint: "refresh_token" }),
  });
  if (!revokeRes.ok) throw new Error(`Apple revoke HTTP ${revokeRes.status}`);
}
