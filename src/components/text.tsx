import { Text as RNText, type TextProps } from "react-native";

import { usePalette } from "@/constants/theme";

type Variant = "title" | "body" | "muted";

const SIZES: Record<Variant, { fontSize: number; fontWeight?: "700" }> = {
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 16 },
  muted: { fontSize: 14 },
};

// 테마 색을 따르는 Text. 화면에서는 react-native 의 Text 대신 이것을 쓴다.
export function Text({ variant = "body", style, ...props }: TextProps & { variant?: Variant }) {
  const palette = usePalette();
  const color = variant === "muted" ? palette.muted : palette.text;
  return <RNText {...props} style={[SIZES[variant], { color }, style]} />;
}
