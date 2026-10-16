import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { AppGate } from "@/components/app-gate";
import { parseConfig } from "@/lib/app-config";

const mockConfig = { current: parseConfig([]) };
jest.mock("@/lib/app-config-provider", () => ({ useAppConfig: () => mockConfig.current }));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0", android: { package: "com.example.app" } } }));

describe("AppGate", () => {
  it("설정이 없으면 앱을 그대로 보여 준다", async () => {
    mockConfig.current = parseConfig([]);
    await render(<AppGate><Text>앱</Text></AppGate>);
    expect(screen.getByText("앱")).toBeTruthy();
  });

  it("최소 지원 버전보다 낮으면 업데이트 화면", async () => {
    mockConfig.current = parseConfig([{ key: "min_version", value: { ios: "2.0.0", android: "2.0.0" } }]);
    await render(<AppGate><Text>앱</Text></AppGate>);
    expect(screen.getByTestId("update-required")).toBeTruthy();
    expect(screen.queryByText("앱")).toBeNull();
  });

  it("점검 중이면 메시지를 보여 준다", async () => {
    mockConfig.current = parseConfig([{ key: "maintenance", value: { enabled: true, message: "10시까지 점검" } }]);
    await render(<AppGate><Text>앱</Text></AppGate>);
    expect(screen.getByText("10시까지 점검")).toBeTruthy();
  });
});
