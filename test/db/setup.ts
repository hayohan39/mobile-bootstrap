// vitest globalSetup: DB 테스트 전에 마이그레이션을 적용한다(TEST_DATABASE_URL 이 있을 때만).
export default async function setup() {
  if (!process.env.TEST_DATABASE_URL) return;
  process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
  const { apply } = await import("../../scripts/db.mjs");
  await apply();
}
