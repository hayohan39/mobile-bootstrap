# 2D 게임 (타워 디펜스 등)

## 엔진 선택

| | Skia + Reanimated (1순위) | Phaser 4 in WebView | react-native-game-engine |
| --- | --- | --- | --- |
| 방식 | GPU 캔버스에 직접 그림, 게임 루프는 UI 스레드(worklet) | 웹 게임 엔진을 WebView 안에서 | 엔티티마다 React View |
| 성능 | 수백 개 개체도 60fps 가능 | 좋음(WebGL) | 수십 개에서 프레임 저하 |
| 물리·타일맵·사운드 | 직접(간단한 충돌은 쉬움) | 엔진 내장 | 직접 |
| 세션에서 확인 | 웹 빌드(CanvasKit)로 Playwright | 브라우저 그대로 | — |
| 앱 기능 연동(저장·결제·광고) | 자연스러움 | WebView ↔ 앱 메시지 다리 필요 | 자연스러움 |
| 유지보수 | Shopify·Software Mansion 활발 | 활발 | **중단 — 쓰지 않는다** |

디펜스류(격자 맵, 경로, 수십~수백 유닛, 탭 입력)는 **Skia + Reanimated** 로 충분하다. 물리·파티클이 많은 액션 게임이나
웹 게임 경험이 이미 있으면 Phaser WebView 를 검토한다(decisions.md 에 기록).

## Skia 구조

```
src/features/game/
  state.ts        순수 게임 로직: 상태 + step(state, dtMs, input) → state  ← vitest 로 테스트(결정적, 화면 없이)
  render.tsx      <Canvas> 에 상태를 그림 (@shopify/react-native-skia)
  loop.ts         useFrameCallback 으로 step 호출, shared value 에 상태
src/app/play.tsx  화면
```

- 🤖 네이티브 PR: `npx expo install @shopify/react-native-skia`(Reanimated 는 이미 있음) — 새 빌드. 웹은 CanvasKit(WASM)을 쓴다.
- **로직과 그림을 나눈다.** `step()` 은 순수 함수라 "웨이브 3 에서 적 10마리가 경로 끝에 닿으면 생명 -10" 같은 규칙을
  vitest 로 빠르게 검증할 수 있다. 시간은 `dtMs` 로만 받는다(`Date.now()` 금지 → 테스트 재현성).
- 매 프레임 React state 를 바꾸지 않는다(리렌더 폭주). 상태는 shared value / ref, 점수 같은 UI 만 가끔 React 로.
- 저장: 진행도는 `expo-sqlite` 또는 AsyncStorage(작으면). 랭킹·친구 대전은 Supabase(점수는 서버에서 검증 —
  클라이언트가 보낸 점수는 조작될 수 있다: Edge Function 이 기록·리플레이를 검사하거나 상한을 둔다).
- 사운드: `expo-audio`. 진동: `expo-haptics`. 화면 방향은 `app.json` 의 `orientation`(네이티브 변경).

## 테스트

- vitest: `step()` 규칙, 웨이브 생성, 충돌.
- Playwright: 웹 빌드에서 게임 화면이 뜨고 "시작" 을 누르면 캔버스가 그려진다(스크린샷 비교는 깨지기 쉬우니 존재·오류 없음만).
- Maestro: 실제 기기 성능은 사람이 스테이징 앱으로 — 저사양 Android 한 대에서 확인할 것을 PR "배포 후 확인" 에.

## 스토어·법

- 연령 등급 설문(App Store, Google Play IARC)이 한국 게임물 자체 등급 분류로 인정된다. 스토어 밖에 배포하면 게임물관리위원회.
- 확률형 아이템(가챠)을 팔면 확률 공개 의무(한국 게임산업법) — 먼저 묻는다.
- 게임 내 재화·아이템 판매는 IAP(`monetization.md`).
