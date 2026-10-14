import { StyleSheet, View } from "react-native";

import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { Spacing, usePalette } from "@/constants/theme";
import { getBuildInfo } from "@/lib/build-info";
import { PROJECT } from "@/lib/project";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const palette = usePalette();
  const build = getBuildInfo();
  return (
    <Screen>
      <Text variant="title" testID="app-title">
        {PROJECT.name}
      </Text>
      <Text variant="muted">{PROJECT.description}</Text>
      <View style={[styles.card, { backgroundColor: palette.card }]} testID="build-info">
        <Text>버전 {build.version}</Text>
        <Text variant="muted">채널 {build.channel ?? "개발"}</Text>
        <Text variant="muted">업데이트 {build.isEmbedded ? "앱에 포함된 번들" : build.updateId}</Text>
        <Text variant="muted">커밋 {build.commit ?? "로컬"}</Text>
        <Text variant="muted">백엔드 {supabase ? "연결됨" : "미설정"}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, borderRadius: 12, gap: Spacing.xs },
});
