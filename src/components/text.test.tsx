import { render, screen } from "@testing-library/react-native";

import { Text } from "@/components/text";

describe("Text", () => {
  it("내용을 그리고 variant 별 글자 크기를 적용한다", async () => {
    await render(<Text variant="title">안녕</Text>);
    expect(screen.getByText("안녕")).toHaveStyle({ fontSize: 24 });
  });
});
