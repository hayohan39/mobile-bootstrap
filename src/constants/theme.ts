import { useColorScheme } from "react-native";

// 기본 색과 간격. UI 라이브러리는 필요해질 때 제안하고 docs/decisions.md 에 남긴다.
export const Colors = {
  light: { text: "#11181C", muted: "#60646C", background: "#FFFFFF", card: "#F0F0F3", tint: "#208AEF", danger: "#D93025" },
  dark: { text: "#ECEDEE", muted: "#B0B4BA", background: "#0B0B0C", card: "#212225", tint: "#5AB0FF", danger: "#FF6B5E" },
} as const;

export type Palette = (typeof Colors)["light"] | (typeof Colors)["dark"];

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? Colors.dark : Colors.light;
}
