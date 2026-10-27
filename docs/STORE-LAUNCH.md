# 스토어 출시 체크리스트

처음 스토어에 내보낼 때 한 번 따라가는 문서다. ☐ 는 **사용자만 할 수 있는 일**(계정·결제·콘솔 버튼),
🤖 는 Claude 가 PR 로 할 수 있는 일이다. 세션에서 "스토어 출시 준비해줘" 라고 하면 Claude 가 이 문서를 위에서부터
확인하며 남은 일을 체크리스트로 알려 준다.

> 숫자·정책은 2026-10 조사 기준이다. 스토어 정책은 자주 바뀌니 콘솔의 안내를 우선한다.

## 0. 시간이 오래 걸리는 것부터

- ☐ **Google Play 개발자 계정** ($25, 1회) — <https://play.google.com/console/signup>
  - **개인 계정은 첫 프로덕션 출시 전에 비공개 테스트를 "테스터 12명 이상, 14일 연속"** 해야 프로덕션 신청이 된다.
    테스터를 일찍 모으고(가족·친구, Google 그룹), 계정이 생기면 바로 비공개 테스트 트랙을 시작한다.
  - 조직 계정(D-U-N-S 번호 필요)은 이 요건이 없다. 사업자가 있으면 조직 계정을 검토한다.
  - 신원 확인(신분증)에 며칠 걸릴 수 있다.
- ☐ **Apple Developer Program** ($99/년) — <https://developer.apple.com/programs/enroll/>
  - 개인 등록은 보통 하루~이틀. 개인 계정에서는 **계정 소유자(Account Holder)만** 서명 인증서를 만들 수 있다.
  - Mac 은 필요 없다. 빌드·서명·업로드는 EAS 가 한다.

## 1. 계정 연결 (계정이 생기면)

- ☐ **App Store Connect API 키** — App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API →
  키 생성(역할: App Manager). `.p8` 파일, Key ID, Issuer ID 를 받는다.
  → expo.dev → 프로젝트 → Credentials → iOS → App Store Connect API Key 에 올린다(파일을 리포지토리에 넣지 않는다).
- ☐ **iOS 첫 빌드 자격증명** — 한 번은 사람이 해야 한다: expo.dev 의 Credentials 화면에서 배포 인증서·프로비저닝 프로필을
  만들거나, 로컬 PC 에서 `npx eas-cli credentials` 를 한 번 실행한다. 이후 CI 는 비대화형으로 쓴다.
- ☐ **App Store Connect 에 앱 등록** — 앱 → + → 새 앱 (번들 ID = `app.json` 의 `ios.bundleIdentifier`).
  생긴 **Apple ID(숫자)** 를 Claude 에게 알려 주면 🤖 `eas.json` 의 `submit.*.ios.ascAppId` 에 넣는 PR 을 만든다.
- ☐ **Google Play 서비스 계정** — Play Console → 설정 → API 액세스(또는 Google Cloud 에서 서비스 계정 생성 → Play Console
  에서 권한 부여: 출시 관리). JSON 키를 expo.dev → Credentials → Android → Google Service Account Key 에 올린다.
- ☐ **Play Console 에 앱 만들기** — 패키지 이름 = `app.json` 의 `android.package`.
  **첫 AAB 는 Play Console 에 직접 올려야 한다**(API 업로드는 그 다음부터 된다): EAS 대시보드에서 production 빌드 파일을
  받아 내부 테스트 트랙에 수동 업로드.
- ☐ GitHub 변수 `EAS_PLATFORMS` 를 `all` 로 (iOS 를 스테이징·출시에 포함).

## 2. 앱 정보·정책 (스토어 심사의 대부분이 여기서 걸린다)

- 🤖 **개인정보처리방침 URL** — 두 스토어와 한국 개인정보보호법 모두 요구한다. 앱의 웹 페이지(`/privacy`)로 만들고
  EAS Hosting 으로 공개한다. 수집 항목·목적·보관 기간·위탁(Supabase, Sentry, Expo)·파기·문의처를 쓴다.
- 🤖 **계정 삭제** — 가입이 있으면 앱 안에서 삭제(Apple 5.1.1(v)), 그리고 **앱 없이 접근 가능한 웹 삭제 경로**(Google).
  Sign in with Apple 을 쓰면 삭제 때 Apple 토큰을 폐기(revoke)한다.
- 🤖 **로그인** — Google·카카오 같은 소셜 로그인을 넣으면 Sign in with Apple(또는 같은 수준의 개인정보 보호 로그인)도(Apple 4.8).
- 🤖 **사용자 생성 콘텐츠**(글·댓글·사진·채팅)가 있으면: 신고, 사용자 차단, 부적절한 콘텐츠 필터, 운영자 연락처(Apple 1.2).
  신고는 24시간 안에 처리할 수 있어야 한다(리뷰어가 흔히 확인). `docs/recipes/ugc-moderation.md`.
- 🤖 **권한 문구** — 카메라·사진·위치·연락처·마이크마다 `app.json` 에 한국어로 "왜 필요한지" (예: "프로필 사진을 찍기 위해 카메라를 사용합니다").
- 🤖 **iOS Privacy Manifest** — `app.json` 의 `ios.privacyManifests` 에 쓰는 API 사유. SDK 를 추가하면 갱신한다.
- ☐ **App Store 개인정보 라벨 / Google Data safety** — 콘솔 설문. 🤖 Claude 가 코드·SDK 를 보고 답안 초안을 만든다
  (Supabase Auth: 이메일, Sentry: 진단 데이터, 푸시 토큰: 기기 ID …). 사용자가 콘솔에 입력한다.
- ☐ **연령 등급** — App Store 연령 등급 설문(13+/16+/18+ 체계), Google Play 콘텐츠 등급(IARC) 설문.
  게임은 한국에서 이 자체 등급으로 유통할 수 있다(스토어 밖 배포는 게임물관리위원회 등급이 따로 필요).
- ☐ **스토어 등록 정보** — 앱 이름·설명·키워드·스크린샷(아이폰 6.9"·6.5", 안드로이드 폰)·아이콘·지원 URL·카테고리.
  🤖 설명 초안과 스크린샷용 화면은 Claude 가 도울 수 있다(웹 프리뷰를 Playwright 로 캡처).
- ☐ **심사용 데모 계정** — 로그인이 필요한 앱이면 심사자가 쓸 계정과 메모(App Review Information).
- ☐ **수출 규정(암호화)** — `app.json` 의 `ios.config.usesNonExemptEncryption: false`(HTTPS 만 사용)로 이미 답해 두었다.
- ☐ **EU 판매** — Apple 의 디지털 서비스법(DSA) 판매자 상태 신고(EU 에 내지 않으면 해당 국가 제외).

## 3. 한국 특유의 것

- **위치 기반 서비스**(근처 매물·동네 인증·지도 위치 공유): 개인 위치정보를 다루면 **위치기반서비스사업 신고**가 필요할 수
  있다(방송통신위원회). 미신고 운영은 처벌 대상이다. 위치를 쓰는 기능을 만들기 전에 Claude 가 묻고, 신고 대상인지 사용자가
  확인한다(필요하면 전문가). `docs/recipes/location.md`.
- **인앱 결제**: 디지털 상품·구독은 스토어 결제(IAP)가 기본. 한국은 법에 따라 대체 결제도 허용되지만 수수료가 크게 낮지 않고
  별도 구현·신청이 필요하다 — 처음에는 IAP 만 쓴다. 실물·숙박 예약 같은 서비스는 외부 결제(PG)를 쓴다. `docs/recipes/monetization.md`.
- **개인정보처리방침·이용약관**: 한국어로. 만 14세 미만 가입을 받으면 법정대리인 동의가 필요하다 — 받지 않는다고 명시하는 편이 쉽다.
- **통신판매업 신고**: 유료 판매(구독·상품)를 하면 사업자등록·통신판매업 신고 대상인지 확인한다.

## 4. 첫 출시 순서

1. 🤖 버전 PR: `app.json` 의 `version` 을 `1.0.0` 으로(이미 그렇다면 생략). merge → "스테이징 올려줘" → 스테이징 빌드 → 폰에서 확인.
2. Android
   1. ☐ 비공개 테스트(개인 계정): Play Console → 테스트 → 비공개 테스트 → 테스터 12명+ 초대 → 14일 유지.
      (그 사이 스테이징 → 비공개 테스트 트랙 업로드는 `eas submit --profile staging` 경로로 추가할 수 있다 — Claude 에게 요청)
   2. ☐ 프로덕션 액세스 신청(설문) → 승인.
   3. 🤖 `node scripts/gh.mjs dispatch release.yml kind=store platforms=android` → 프로덕션 트랙 10% 단계적 출시로 제출.
      (첫 출시는 Play 심사가 며칠 걸릴 수 있다)
3. iOS
   1. 🤖 `node scripts/gh.mjs dispatch release.yml kind=store platforms=ios` → App Store Connect 업로드.
   2. ☐ App Store Connect → 버전 정보·스크린샷·심사 정보 → 빌드 선택 → **단계적 출시 켜기** → 심사에 제출.
4. 출시 후: Sentry crash-free, 스토어 리뷰·평점, Play Vitals(ANR·비정상 종료율)를 본다. 문제가 있으면 `docs/runbook.md`.

## 5. 출시 이후 업데이트

- JS 변경은 OTA 로(심사 없음, `kind=ota`). 단 **앱의 핵심 목적·기능을 OTA 로 크게 바꾸지 않는다**(Apple 2.5.2).
  새 큰 기능·새 권한·결제 변경은 스토어 버전으로 낸다.
- 스토어 버전은 `version` 을 올리는 PR → 스테이징 확인 → `kind=store`.
- Google Play target API: 매년 8월 말부터 새 업데이트는 최신 API 레벨을 타깃해야 한다(2026: API 36). Expo SDK 를 제때
  올리면 맞춰진다 — 세션에서 "Expo SDK 올려줘".
