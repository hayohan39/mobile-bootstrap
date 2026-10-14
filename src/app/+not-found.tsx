import { Link, Stack } from "expo-router";

import { Screen } from "@/components/screen";
import { Text } from "@/components/text";

export default function NotFound() {
  return (
    <Screen>
      <Stack.Screen options={{ title: "페이지 없음" }} />
      <Text variant="title">찾는 화면이 없습니다</Text>
      <Link href="/">
        <Text>홈으로</Text>
      </Link>
    </Screen>
  );
}
