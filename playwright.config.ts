import { defineConfig, devices } from "@playwright/test";

// 웹 export(dist/) 를 띄워 앱 화면이 실제로 렌더링되는지 본다. 네이티브 동작은 Maestro(CI)가 본다.
// 클라우드 세션에는 브라우저 다운로드가 막혀 있어, 미리 설치된 Chromium 을 PW_CHROMIUM_PATH 로 쓴다
// (session-start.sh 가 설정한다). CI 는 `npx playwright install chromium` 으로 받은 것을 쓴다.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e/web",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
