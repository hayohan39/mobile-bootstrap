// 화면·컴포넌트 테스트(React Native). 순수 로직·스크립트·DB 테스트는 vitest(test/**) 가 맡는다.
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.tsx", "**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/app/"],
  setupFiles: ["<rootDir>/jest.setup.js"],
};
