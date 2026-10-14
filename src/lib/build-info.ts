import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { optionalEnv } from "@/lib/env";

// 지금 돌고 있는 앱이 어떤 빌드·업데이트인지. 앱 정보 화면과 Sentry 태그에 쓴다.
// 사용자가 "OTA 가 반영됐나?" 를 폰에서 확인하는 유일한 창구이므로 항상 보이게 둔다.
export type BuildInfo = {
  version: string;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  isEmbedded: boolean;
  commit: string | null;
};

export function getBuildInfo(): BuildInfo {
  return {
    version: Constants.expoConfig?.version ?? "0.0.0",
    channel: Updates.channel ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
    isEmbedded: Updates.isEmbeddedLaunch,
    commit: optionalEnv("EXPO_PUBLIC_COMMIT_SHA")?.slice(0, 7) ?? null,
  };
}
