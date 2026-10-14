import { expect, test } from "@playwright/test";

// 웹 export 가 실제로 렌더링되는지(번들 오류·런타임 예외가 없는지) 확인하는 최소 스모크.
// 기능을 추가하면 그 화면의 핵심 흐름을 여기에 한두 개씩 더한다.
test("홈 화면이 렌더링되고 런타임 오류가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("app-title")).toBeVisible();
  await expect(page.getByTestId("build-info")).toContainText("버전");
  expect(errors).toEqual([]);
});

test("없는 경로는 안내 화면을 보여 준다", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("찾는 화면이 없습니다")).toBeVisible();
});
