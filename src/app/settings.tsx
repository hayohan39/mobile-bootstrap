import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { Spacing, usePalette } from "@/constants/theme";
import { deleteAccount, signOut, useSession } from "@/lib/auth";
import { PROJECT } from "@/lib/project";
import { enablePush, type PushResult } from "@/lib/push";

const PUSH_MESSAGES: Record<Exclude<PushResult, { ok: true }>["reason"], string> = {
  unsupported: "이 기기에서는 알림을 쓸 수 없습니다.",
  denied: "알림 권한이 꺼져 있습니다. 기기 설정에서 켜 주세요.",
  "not-configured": "알림 설정이 아직 끝나지 않았습니다.",
  error: "알림을 켜지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export default function Settings() {
  const palette = usePalette();
  const { session, loading } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (loading) return <Screen>{null}</Screen>;
  if (!session) return <Redirect href="/sign-in" />;

  async function onDelete() {
    if (!session) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteAccount(session);
    } catch {
      setMessage("계정을 삭제하지 못했습니다. 잠시 후 다시 시도하거나 문의해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function onPush() {
    const result = await enablePush();
    setMessage(result.ok ? "알림을 켰습니다." : PUSH_MESSAGES[result.reason]);
  }

  return (
    <Screen>
      <Text variant="title">설정</Text>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text>{session.user.email ?? "로그인됨"}</Text>
        <Button title="로그아웃" variant="secondary" onPress={() => signOut()} testID="sign-out" />
      </View>

      {Platform.OS !== "web" ? <Button title="알림 켜기" variant="secondary" onPress={onPush} /> : null}

      <View style={[styles.card, { backgroundColor: palette.card }]} testID="delete-section">
        <Text>계정 삭제</Text>
        <Text variant="muted">계정과 이 앱에 저장된 내 데이터가 모두 삭제되며 되돌릴 수 없습니다.</Text>
        {confirming ? (
          <>
            <Button title="삭제합니다" variant="danger" loading={busy} onPress={onDelete} testID="confirm-delete" />
            <Button title="취소" variant="secondary" onPress={() => setConfirming(false)} />
          </>
        ) : (
          <Button title="계정 삭제" variant="danger" onPress={() => setConfirming(true)} testID="delete-account" />
        )}
      </View>

      {message ? <Text variant="muted">{message}</Text> : null}

      <View style={styles.links}>
        <Link href="/privacy">
          <Text variant="muted">개인정보처리방침</Text>
        </Link>
        <Link href="/terms">
          <Text variant="muted">이용약관</Text>
        </Link>
        {PROJECT.supportEmail ? <Text variant="muted">문의 {PROJECT.supportEmail}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, borderRadius: 12, gap: Spacing.sm },
  links: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
});
