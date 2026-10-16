import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

import { Text } from "@/components/text";
import { Spacing, usePalette } from "@/constants/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
};

// 앱 공용 버튼. 화면에서는 Pressable 을 직접 쓰지 않고 이것을 쓴다(테마·접근성·로딩 상태를 한곳에서).
export function Button({ title, onPress, variant = "primary", disabled = false, loading = false, testID }: Props) {
  const palette = usePalette();
  const background = variant === "primary" ? palette.tint : variant === "danger" ? palette.danger : palette.card;
  const color = variant === "secondary" ? palette.text : "#FFFFFF";
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 12, paddingHorizontal: Spacing.md, alignItems: "center", justifyContent: "center" },
  label: { fontWeight: "600" },
});
