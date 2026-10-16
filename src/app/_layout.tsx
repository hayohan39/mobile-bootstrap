import * as Sentry from "@sentry/react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { AppGate } from "@/components/app-gate";
import { AppConfigProvider } from "@/lib/app-config-provider";
import { AuthProvider } from "@/lib/auth";
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
      <AppConfigProvider>
        <AuthProvider>
          <AppGate>
            <Stack>
              <Stack.Screen name="index" options={{ title: "홈" }} />
              <Stack.Screen name="sign-in" options={{ title: "로그인" }} />
              <Stack.Screen name="settings" options={{ title: "설정" }} />
              <Stack.Screen name="privacy" options={{ title: "개인정보처리방침" }} />
              <Stack.Screen name="terms" options={{ title: "이용약관" }} />
              <Stack.Screen name="delete-account" options={{ title: "계정 삭제" }} />
            </Stack>
          </AppGate>
        </AuthProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);
