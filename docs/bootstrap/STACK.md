# 스택 선택

고정한 것과 그 이유, 검토한 대안. 숫자는 **2026-10 조사 기준**이며 일부는 공식 요금표를 직접 확인하지 못했다(표시함) —
프로젝트를 만들 때 요금표에서 다시 본다.

## 앱 프레임워크: Expo (React Native) — 고정

| | Expo + EAS | Flutter | Capacitor (웹앱 + 네이티브 셸) |
| --- | --- | --- | --- |
| Linux 만으로 iOS 빌드·제출 | ✅ EAS Build/Submit (1st-party) | macOS CI 필요 (Codemagic 무료 500분/월) | macOS CI 필요 |
| OTA 업데이트 | ✅ EAS Update (롤아웃·롤백·fingerprint) | Shorebird (Dart 코드만, 별도 서비스) | Capgo / Appflow (별도) |
| 세션에서 화면 검증 | ✅ 웹 export → Playwright | 웹 빌드 가능하지만 렌더러가 달라 신뢰도 낮음 | ✅ 웹 그대로 |
| 네이티브 UX·성능 | 네이티브 컴포넌트, New Architecture | 매우 좋음 | WebView 기반 |
| AI 가 쓰기 쉬움 | TypeScript/React — 학습 데이터 많음 | Dart | 웹 기술 |

Expo SDK 57(React Native 0.86, New Architecture 필수)로 시작한다. SDK 58 은 베타였다(UIKit scene 수명주기 변경).

## 백엔드: Supabase — 고정 (사용자 결정)

| | Supabase | Firebase | Neon + 직접 만든 API |
| --- | --- | --- | --- |
| 인증(Apple/Google/이메일) | ✅ 내장 | ✅ 내장 | 직접 |
| 파일 저장소 | ✅ Storage | Blaze(유료) 필요 | 직접(R2 등) |
| 실시간(채팅) | ✅ Realtime | ✅ Firestore | 직접 |
| 서버 로직 | Edge Functions(Deno) | Functions(Blaze) | Vercel 등 |
| 데이터 모델 | Postgres + RLS — SQL 마이그레이션·Risk 스캐너 재사용 | NoSQL | Postgres |
| 무료 | 프로젝트 2개, 7일 미사용 일시정지, 백업 없음 | Spark — 일일 읽기/쓰기 한도 | 넉넉함 |

커뮤니티·마켓·SNS·예약 앱은 인증 + 파일 + 실시간 + 서버 권한(RLS)이 모두 필요해 Supabase 가 가장 적게 만든다.
오프라인 우선 앱(Anki 류)은 `expo-sqlite` 를 주 저장소로 두고 필요할 때 동기화한다 — `docs/recipes/offline-sync.md`.

## 운영

| 무엇 | 선택 | 무료 범위 (조사 시점) | 대안 |
| --- | --- | --- | --- |
| 빌드·제출·OTA | EAS | 월 Android 15 + iOS 15 빌드, OTA 1,000 MAU, Workflows 60분 (요금표 직접 확인 못 함) | Codemagic, GitHub macOS 러너 + fastlane |
| 웹 프리뷰·정책 페이지 | EAS Hosting | 무료 플랜 포함 | Vercel, Netlify |
| 오류·크래시 | Sentry (`@sentry/react-native`) | Developer 무료 | Crashlytics |
| e2e | Maestro (CI 의 Android 에뮬레이터) | 무료(러너 시간) | Detox, Maestro Cloud |
| CI/CD | GitHub Actions + Claude | 비공개 리포 월 2,000분 | — |

## 레시피로 둔 것 (앱마다 결정 — `docs/recipes/`)

| 필요 | 1순위 | 대안 | 메모 |
| --- | --- | --- | --- |
| 구독·인앱결제 | RevenueCat (`react-native-purchases`) | `expo-iap` | 무료 한도는 월 추적 매출 기준(조사 시점 $2,500, 출처 간 불일치 — 확인) |
| 광고 | AdMob (`react-native-google-mobile-ads`) + UMP/ATT 동의 | — | 개발 빌드 필요 |
| 2D 게임 | `@shopify/react-native-skia` + Reanimated | Phaser 4 in WebView | react-native-game-engine 은 유지보수 중단 |
| 푸시 | `expo-notifications` + Expo Push | 직접 FCM/APNs | Expo Go 에서는 원격 푸시 불가(개발 빌드) |
| 오프라인 동기화 | expo-sqlite + 직접 동기화 | PowerSync, Legend-State | |
| 지도·위치 | `expo-location` (+ `react-native-maps`) | — | 위치정보법 신고 판단 먼저 |

## 다시 확인할 것 (불확실)

- EAS·Supabase·RevenueCat 무료 한도의 정확한 숫자
- Supabase 의 Data API GRANT 정책 변경(2026-10-30 예정이라는 단일 출처) — 새 테이블에 `grant ... to authenticated` 가
  필요해질 수 있다. 템플릿의 마이그레이션은 이미 명시적으로 GRANT 한다.
- 한국 인앱결제(대체 결제) 수수료 조건의 2026 변경 여부, 위치정보법의 "동네 인증" 적용 범위
