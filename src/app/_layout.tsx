import * as Sentry from "@sentry/react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { getBuildInfo } from "@/lib/build-info";
import { optionalEnv } from "@/lib/env";
import { sentryOptions } from "@/lib/sentry";

const build = getBuildInfo();
Sentry.init(sentryOptions(optionalEnv("EXPO_PUBLIC_SENTRY_DSN"), { channel: build.channel }));
Sentry.setTags({ commit: build.commit ?? "unknown", update_id: build.updateId ?? "embedded" });

function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "홈" }} />
      </Stack>
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);
