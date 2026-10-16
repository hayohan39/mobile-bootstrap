import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button } from "@/components/button";

describe("Button", () => {
  it("누르면 onPress, 비활성·로딩이면 무시", async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button title="저장" onPress={onPress} testID="b" />);
    await fireEvent.press(screen.getByTestId("b"));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button title="저장" onPress={onPress} disabled testID="b" />);
    await fireEvent.press(screen.getByTestId("b"));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button title="저장" onPress={onPress} loading testID="b" />);
    expect(screen.queryByText("저장")).toBeNull();
  });
});
