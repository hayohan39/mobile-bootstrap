import { expect, test } from "@playwright/test";

// 스토어에 등록하는 공개 URL(개인정보처리방침·계정 삭제)과 로그인 화면이 웹에서 열리는지.
for (const [path, testId] of [
  ["/privacy", "privacy-title"],
  ["/terms", "terms-title"],
  ["/delete-account", "delete-account-title"],
] as const) {
  test(`${path} 가 열린다`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId(testId)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("로그인 화면: 백엔드가 없으면 안내, 있으면 이메일 입력", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByTestId("backend-missing").or(page.getByTestId("email-input"))).toBeVisible();
});
