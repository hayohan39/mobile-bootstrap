import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { log } from "@/lib/log";
import { supabase } from "@/lib/supabase";

// 푸시 알림 토큰 등록. 권한은 사용자가 알림을 켜는 순간에만 요청한다(앱 시작 때 묻지 않는다 — 거절률이 높고 심사에서도 지적).
// 보내는 쪽은 Edge Function 에서 Expo Push API 로(docs/recipes/push.md). Android 는 FCM 설정이 있어야 토큰이 나온다.

export type PushResult = { ok: true } | { ok: false; reason: "unsupported" | "denied" | "not-configured" | "error" };

export async function enablePush(): Promise<PushResult> {
  if (Platform.OS === "web" || !Device.isDevice || !supabase) return { ok: false, reason: "unsupported" };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return { ok: false, reason: "not-configured" };

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "기본", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: "denied" };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase
      .from("push_tokens")
      .upsert({ token, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: "user_id,token" });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    log.warn("푸시 토큰 등록 실패", { error });
    return { ok: false, reason: "error" };
  }
}
