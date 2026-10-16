import { Link } from "expo-router";

import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { usePalette } from "@/constants/theme";
import { useSession } from "@/lib/auth";
import { PROJECT } from "@/lib/project";

// 앱 없이도 열 수 있는 계정 삭제 안내(Google Play 데이터 보안 양식의 "계정 삭제 URL"). 웹에서도 로그인 후 바로 삭제할 수 있다.
export default function DeleteAccountInfo() {
  const palette = usePalette();
  const { session } = useSession();
  return (
    <Screen>
      <Text variant="title" testID="delete-account-title">
        {PROJECT.name} 계정 삭제
      </Text>
      <Text>계정을 삭제하면 계정과 이 서비스에 저장된 내 데이터(프로필, 알림 설정 등)가 즉시 삭제되며 되돌릴 수 없습니다.</Text>
      <Text>앱에서: 설정 → 계정 삭제</Text>
      <Text>웹에서: 로그인한 뒤 설정 → 계정 삭제</Text>
      <Link href={session ? "/settings" : "/sign-in"}>
        <Text style={{ color: palette.tint }}>{session ? "설정으로 가기" : "로그인하고 삭제하기"}</Text>
      </Link>
      {PROJECT.supportEmail ? <Text variant="muted">로그인할 수 없으면 {PROJECT.supportEmail} 로 가입한 이메일과 함께 요청해 주세요.</Text> : null}
    </Screen>
  );
}
