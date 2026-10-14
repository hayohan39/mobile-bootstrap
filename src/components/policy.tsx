import { StyleSheet, View } from "react-native";

import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";

export type PolicySection = { title: string; body: string[] };

// 정책 문서(개인정보처리방침·이용약관) 공용 화면. 웹 export 로 공개 URL 이 되어 스토어에 등록된다.
export function Policy({ title, intro, sections, testID }: { title: string; intro: string; sections: PolicySection[]; testID?: string }) {
  return (
    <Screen>
      <Text variant="title" testID={testID}>
        {title}
      </Text>
      <Text variant="muted">{intro}</Text>
      {sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.heading}>{s.title}</Text>
          {s.body.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.xs },
  heading: { fontWeight: "700" },
});
