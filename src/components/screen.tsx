import type { ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Spacing, usePalette } from "@/constants/theme";

// 모든 화면의 바깥 틀: 안전 영역 + 스크롤 + 배경색.
export function Screen({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, maxWidth: 720, width: "100%", alignSelf: "center" },
});
