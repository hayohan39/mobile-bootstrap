import { StyleSheet, TextInput, type TextInputProps } from "react-native";

import { Spacing, usePalette } from "@/constants/theme";

// 테마를 따르는 입력 칸.
export function TextField(props: TextInputProps) {
  const palette = usePalette();
  return (
    <TextInput
      placeholderTextColor={palette.muted}
      {...props}
      style={[styles.input, { color: palette.text, backgroundColor: palette.card }, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: Spacing.md, fontSize: 16 },
});
