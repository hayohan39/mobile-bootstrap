import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { optionalEnv } from "@/lib/env";

// Supabase 클라이언트. URL·키가 없으면(백엔드 미설정 단계) null — 화면은 이를 "백엔드 미설정" 으로 보여 준다.
// 이 키는 공개 키다. 데이터 보호는 전적으로 RLS(supabase/migrations) 가 한다.
const url = optionalEnv("EXPO_PUBLIC_SUPABASE_URL");
const key = optionalEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

// 웹 정적 렌더링(서버) 단계에는 window 가 없으므로 세션을 저장하지 않는다.
const isServer = Platform.OS === "web" && typeof window === "undefined";

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: Platform.OS === "web" ? undefined : AsyncStorage,
          autoRefreshToken: !isServer,
          persistSession: !isServer,
          detectSessionInUrl: Platform.OS === "web" && !isServer,
        },
      })
    : null;

// 앱이 포그라운드일 때만 토큰을 갱신한다(Supabase 권장 패턴). 웹은 브라우저가 알아서 한다.
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
