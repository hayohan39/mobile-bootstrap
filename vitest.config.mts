import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 순수 로직(src/lib 의 RN 비의존 모듈)·스크립트·DB(RLS) 테스트. 화면 테스트는 jest(jest-expo).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/db/setup.ts"],
  },
});
