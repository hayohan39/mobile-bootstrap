// POST /functions/v1/delete-account  (Authorization: Bearer <사용자 액세스 토큰>)
// 본문(선택): { "apple_authorization_code": "..." } — Apple 로 가입한 계정이면 앱이 Apple 로그인 창으로 받아 보낸다.
import { createClient } from "npm:@supabase/supabase-js@2";

import { appleConfigFromEnv, revokeAppleAuthorization } from "../_shared/apple.ts";
import { handleDeleteAccount } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const apple = appleConfigFromEnv((name) => Deno.env.get(name));

Deno.serve((req) =>
  handleDeleteAccount(req, {
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, providers: (data.user.identities ?? []).map((i) => i.provider) };
    },
    deleteUser: async (id) => {
      // 사용자 파일(Storage)을 만들기 시작하면 여기서 <bucket>/<user id>/ 를 먼저 지운다.
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    },
    revokeApple: apple ? (code) => revokeAppleAuthorization(apple, code) : undefined,
    // 개인정보(이메일 등)는 남기지 않는다.
    log: (level, msg, fields) => console[level === "info" ? "log" : level](JSON.stringify({ level, msg, ...fields })),
  }),
);
