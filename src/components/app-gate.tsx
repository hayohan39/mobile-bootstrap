import Constants from "expo-constants";
import * as Linking from "expo-linking";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Spacing, usePalette } from "@/constants/theme";
import { needsUpdate, storeUrl } from "@/lib/app-config";
import { useAppConfig } from "@/lib/app-config-provider";
import { PROJECT } from "@/lib/project";

// 원격 설정에 따라 앱 전체를 막는 화면: 점검 중 / 최소 지원 버전 미만(강제 업데이트).
// 웹 프리뷰·정책 페이지는 막지 않는다(스토어 버전과 무관).
export function AppGate({ children }: { children: ReactNode }) {
  const config = useAppConfig();
  const palette = usePalette();
  if (Platform.OS === "web") return children;

  const version = Constants.expoConfig?.version ?? "0.0.0";
  if (needsUpdate(config, Platform.OS as "ios" | "android", version)) {
    const url = storeUrl(Platform.OS as "ios" | "android", {
      androidPackage: Constants.expoConfig?.android?.package,
      appStoreId: PROJECT.appStoreId,
    });
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]} testID="update-required">
        <Text variant="title">업데이트가 필요합니다</Text>
        <Text variant="muted">이 버전({version})은 더 이상 지원되지 않습니다. 스토어에서 최신 버전으로 업데이트해 주세요.</Text>
        {url ? <Button title="업데이트" onPress={() => Linking.openURL(url)} /> : null}
      </View>
    );
  }
  if (config.maintenance.enabled) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]} testID="maintenance">
        <Text variant="title">점검 중입니다</Text>
        <Text variant="muted">{config.maintenance.message ?? "잠시 후 다시 이용해 주세요."}</Text>
      </View>
    );
  }
  return children;
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: Spacing.lg, gap: Spacing.md, justifyContent: "center" },
});
