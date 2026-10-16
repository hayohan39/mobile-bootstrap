// 네이티브 모듈 목(mock). jest-expo 가 Expo 모듈은 대부분 처리하고, 나머지만 여기서.
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
