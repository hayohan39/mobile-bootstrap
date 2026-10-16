import { Redirect } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";

import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { usePalette } from "@/constants/theme";
import { isEnabled } from "@/lib/app-config";
import { useAppConfig } from "@/lib/app-config-provider";
import { authErrorMessage, isValidEmail, sendEmailCode, signInWithApple, signInWithOAuth, useSession, verifyEmailCode } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// 로그인: 이메일로 받은 6자리 코드(비밀번호 없음). Apple·Google 은 app_config 의 features 로 켠다.
export default function SignIn() {
  const palette = usePalette();
  const config = useAppConfig();
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (session) return <Redirect href="/" />;
  if (!supabase) {
    return (
      <Screen>
        <Text variant="muted" testID="backend-missing">
          백엔드가 설정되지 않아 로그인할 수 없습니다.
        </Text>
      </Screen>
    );
  }

  const apple = isEnabled(config, "login_apple", false);
  // Apple 4.8: iOS 에서 Google 을 보이려면 Apple 로그인도 있어야 한다.
  const google = isEnabled(config, "login_google", false) && (Platform.OS !== "ios" || apple);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="title">로그인</Text>
      {sent ? (
        <>
          <Text variant="muted">{email} 로 보낸 6자리 코드를 입력하세요.</Text>
          <TextField value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} placeholder="123456" testID="code-input" />
          <Button title="확인" loading={busy} disabled={code.trim().length < 6} onPress={() => run(() => verifyEmailCode(email, code))} />
          <Button title="이메일 다시 입력" variant="secondary" onPress={() => setSent(false)} />
        </>
      ) : (
        <>
          <TextField value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="이메일" testID="email-input" />
          <Button
            title="코드 받기"
            loading={busy}
            disabled={!isValidEmail(email)}
            onPress={() => run(async () => { await sendEmailCode(email); setSent(true); })}
            testID="send-code"
          />
          {apple ? <Button title="Apple 로 계속하기" variant="secondary" onPress={() => run(signInWithApple)} /> : null}
          {google ? <Button title="Google 로 계속하기" variant="secondary" onPress={() => run(() => signInWithOAuth("google"))} /> : null}
        </>
      )}
      {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
      <Text variant="muted">계속하면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.</Text>
    </Screen>
  );
}
