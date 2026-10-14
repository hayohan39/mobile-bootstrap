# Expo 는 학습 데이터와 다르다

이 앱은 Expo SDK 57 (React Native 0.86, Expo Router) 이다. Expo 는 SDK 마다 API 가 바뀐다.
Expo·EAS·React Native API 를 쓰기 전에:

1. `package.json` 의 `expo` 메이저 버전을 확인한다.
2. 문서를 확인한다: `https://docs.expo.dev/versions/v<major>.0.0/` · `https://docs.expo.dev/llms.txt`.
   클라우드 세션에서 docs.expo.dev 가 막혀 있으면(403) `node_modules/<패키지>/` 의 README·타입 선언(`*.d.ts`)과
   `build/` 소스를 읽고 판단한다. 추측으로 쓰지 않는다.

## Commands

세션에서는 `EXPO_OFFLINE=1` 이 설정돼 있다(시작 훅). `expo install` 은 SDK 에 맞는 버전을 오프라인 표로 고른다.

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

빌드·서명·스토어 제출(`eas build`, `eas submit`)과 OTA 업데이트(`eas update`)는 EAS 클라우드가 한다. 로컬 Xcode·Android Studio 는 필요 없다.
이 리포지토리에서는 **EAS 명령을 GitHub Actions 워크플로가 실행한다**(`EXPO_TOKEN` 시크릿). 클라우드 세션은 expo.dev 에
접속하지 못할 수 있으므로 세션에서 `eas` 를 직접 돌리지 말고 워크플로(`node scripts/gh.mjs dispatch ...`)를 쓴다.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
