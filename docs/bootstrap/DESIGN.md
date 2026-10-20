# 설계 근거

mobile-bootstrap 이 왜 이렇게 생겼는지. production-bootstrap(웹)의 [DESIGN.md](https://github.com/hayohan39/production-bootstrap/blob/main/docs/bootstrap/DESIGN.md)
에서 그대로 가져온 결정(클라우드 세션의 GitHub 프록시, REST 헬퍼, auto-fix 토큰, 품질 리뷰, Risk Score 의 두 겹 평가와
main 의 코드로 평가하기, risk-gate)은 반복하지 않고 **모바일이라서 달라진 것**만 쓴다.

## 1. 세션은 Linux 이고 기기가 없다 → Expo + EAS

- iOS 앱은 Xcode(macOS)로만 빌드된다. 세션·GitHub 의 기본 러너는 Linux 다. macOS 러너는 비공개 리포에서 분당 10배 비용이다.
- EAS Build 는 Expo 의 macOS 머신에서 빌드하고 서명 키를 보관하며, EAS Submit 은 Linux 에서 스토어로 올린다.
  "Linux 에서 코드만 고치고 iOS 까지 출시" 가 1st-party 로 되는 유일한 경로라서 고정했다(대안 비교: [STACK.md](STACK.md)).
- 세션은 기기를 띄울 수 없으므로 검증을 세 층으로 나눴다:
  1. **세션·CI**: 로직(vitest), 화면(jest + Testing Library), **웹 export 를 Chromium 에서 렌더링**(Playwright).
     React Native Web 이 같은 컴포넌트를 그리므로 "화면이 뜨고 예외가 없는지" 는 세션에서 확인된다.
  2. **CI 의 Android 에뮬레이터**(KVM 이 있는 ubuntu 러너) + Maestro — 네이티브 변경일 때. EAS 빌드 한도를 쓰지 않는다.
  3. **사람의 폰** — 스테이징 앱(Android APK / iOS TestFlight). merge 와 출시 사이의 사람 게이트다.

## 2. 세션 네트워크 → 원격 작업은 GitHub Actions

기본 클라우드 환경은 expo.dev·supabase.com·sentry.io 를 막는다(npm 과 GitHub 은 열려 있다). 그래서 EAS·Supabase 원격 작업은
모두 워크플로가 하고, 세션은 `scripts/gh.mjs dispatch` 로 부른다. 세션 시작 훅은 `EXPO_OFFLINE=1` 을 켜서 `expo install`·
`expo export` 가 네트워크 없이 돌게 한다. Supabase CLI 는 GitHub 릴리스에서 받아지므로 세션에서도 쓸 수 있지만
Docker 데몬이 없어 로컬 Supabase 는 못 띄운다 → 세션의 일반 Postgres 에 `supabase/local-shim.sql`(auth 스키마·역할·
`auth.uid()`)을 깔아 같은 RLS 테스트를 돌린다. CI 는 `supabase db start` 로 진짜 Supabase Postgres 에서 돈다.

## 3. 되돌릴 수 없는 바이너리 → fingerprint 로 OTA/네이티브를 기계적으로 나눈다

웹은 배포가 곧 전체 교체이고 롤백이 몇 초다. 앱은 **설치된 바이너리**가 사용자 폰에 남고, 그 위의 **JS 번들**만 OTA 로 바꿀 수 있다.

- `app.json` 의 `runtimeVersion: { policy: "fingerprint" }` — 네이티브에 영향을 주는 모든 것(네이티브 패키지, app.json,
  config plugin, SDK)의 해시가 runtimeVersion 이 된다. OTA 업데이트는 같은 runtimeVersion 의 바이너리에만 간다.
  사람이 버전 규칙을 지키지 않아도 "호환되지 않는 JS 가 옛 바이너리에 가서 크래시" 가 구조적으로 막힌다.
- CI 의 `fingerprint` job 이 base·head 를 비교해 **네이티브 변경 여부**를 PR 에 표시하고 Risk 에 넣는다(HIGH 이상).
  비교는 네트워크 없이 `expo-updates runtimeversion:resolve` 로 한다.
- 스테이징 배포는 "같은 fingerprint 의 스테이징 빌드가 있으면 OTA, 없으면 새 빌드" — 사람이 판단하지 않는다.

## 4. merge = 스테이징, 출시 = 사람의 요청

웹 production-bootstrap 은 merge = 프로덕션이었다(스테이징 스모크 + 자동 롤백이 안전망). 앱은

- 스토어 빌드는 심사를 거치고 되돌릴 수 없으며, 자동 스모크로 확인할 수 없는 것(권한, 푸시, 결제, 실제 기기 성능)이 많다.
- 그래서 merge 는 **스테이징 채널**(내부 테스트 앱)까지만 가고, 사람이 폰으로 확인한 뒤 "출시해줘" 로 `release.yml` 을 부른다.
- OTA 출시도 바로 100% 가 아니라 **10% 롤아웃**으로 시작하고 `rollout-monitor.yml` 이 Sentry crash-free 로 올리거나 취소한다.
- 스토어 출시는 `main` 이 마지막 스테이징 배포 커밋과 같을 때만(확인하지 않은 코드가 섞이지 않게).

## 5. DB 는 하나 — 스테이징과 프로덕션이 공유

스테이징 전용 Supabase 프로젝트를 두면 무료 플랜 2개를 다 쓰고, 마이그레이션이 두 번 돌고, 스테이징에서 본 데이터와
실제가 달라진다. 대신 **DB 마이그레이션은 merge 순간 프로덕션에 적용**되고, expand → contract 규칙과 Risk 규칙
(출시된 앱이 쓰는 이름 삭제 = CRITICAL, RLS 없는 테이블 = VERY HIGH)이 이를 안전하게 한다.
PR 단계의 DB 검증은 CI 의 로컬 Supabase 에서 빈 DB 부터 모든 마이그레이션 + RLS 테스트. 프로덕션 데이터로 미리 돌려 보는
웹 템플릿의 "프로덕션 복제 브랜치" 는 Supabase Branching(유료)이 있어야 해서 넣지 않았다 — 필요해지면 decisions.md 에.

GitHub 러너는 IPv6 를 못 쓰고 Supabase 의 직접 연결은 IPv6 전용이라, 마이그레이션은 **Session pooler**(5432) 로 한다.

## 6. 구버전 앱이 consumer 다

웹은 배포 후 몇 분이면 모든 사용자가 새 코드다. 앱은 업데이트하지 않은 사용자가 몇 달 남는다. Risk rubric 의 Compatibility
consumer 를 "출시된 모든 앱 버전" 으로 바꾸고, 앱에 **최소 지원 버전**(강제 업데이트)과 **원격 킬스위치**(`app_config`)를
기본 기능으로 넣었다. contract(옛 컬럼 삭제)는 최소 지원 버전을 올린 뒤에만 한다.

## 7. 스토어 규정은 코드 리뷰 대상

거절 사유 상위(계정 삭제 없음, 소셜 로그인만 있고 Apple 로그인 없음, UGC 신고·차단 없음, 디지털 상품 외부 결제,
목적 문구 없는 권한)를 CLAUDE.md "스토어 규정" 과 AI 리뷰의 finding 범주(`store`)에 넣었다. 기능을 만들 때 걸리게 해서
출시 직전에 몰아서 고치지 않게 한다. 거의 모든 예시 앱(커뮤니티·마켓·SNS·예약)에 필요한 로그인·계정 삭제·정책 페이지·
강제 업데이트는 템플릿에 기본으로 넣고, 앱마다 다른 것(UGC, 결제, 광고, 게임, 위치)은 `docs/recipes/` 로 뒀다.

## 8. 테스트 러너가 둘인 이유

vitest 는 `.mjs` 스크립트(Risk·출시·프로비저닝)와 DB 테스트를 ESM 그대로 빠르게 돌린다. React Native 컴포넌트는 jest-expo 의
변환(babel·네이티브 모듈 목)이 필요하다. 그래서 `test/**`(vitest)와 `src/**/*.test.tsx`(jest)로 나눴다. `npm test` 가 둘 다 돈다.

## 9. 처음엔 Android 만

`EAS_PLATFORMS` 기본값은 `android`. Android 스테이징 빌드는 계정 없이 APK 링크로 폰에 설치된다. iOS 는 Apple Developer 계정
(서명)이 있어야 기기에 설치된다(TestFlight). 계정을 연결하면 변수를 `all` 로 바꾸기만 하면 된다.

## 10. Actions 안의 Claude 와 토큰 — 누가 무엇으로 push 하나

GitHub 는 **`GITHUB_TOKEN` 으로 한 push 로는 워크플로를 다시 실행하지 않는다**(무한 루프 방지). 그래서 auto-fix·품질 리뷰·`@claude` 가
고친 커밋이 CI 를 다시 받으려면 다른 토큰으로 push 해야 한다.

| 토큰 | 어디서 | 쓰임 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 워크플로마다 자동 | 체크아웃, PR 코멘트·라벨, action 이 시작하기 전의 git 명령 |
| Claude App 토큰 | `claude-code-action` 이 OIDC 로 받음(Claude GitHub App 설치 필요) | Claude 의 `git push` → CI 다시 실행 |
| `BOT_PAT`(선택) | 시크릿 | App 대신 쓰는 토큰. 있으면 위 두 자리를 모두 대신한다 |

ci.yml(refine·autofix)과 claude-mention.yml 의 순서:

1. `actions/checkout` 은 `persist-credentials: false` — v7 은 토큰을 includeIf 로 따로 저장하는데 action 이 그걸 지우지 못한다.
2. 다음 스텝이 토큰을 `.git/config` 의 `http.https://github.com/.extraheader`(checkout v4 방식)로 넣는다.
   action 앞의 git 명령(`@claude` 가 PR 브랜치를 fetch 하는 것 등)은 이 토큰을 쓴다.
3. action 이 시작하며 이 헤더를 지우고("Removing existing git authentication headers") 원격 주소에 App 토큰을 넣는다 → push 는 App 토큰.
4. action 은 끝날 때 App 토큰을 폐기한다. 그 뒤 스텝은 git 원격 대신 API(`gh`, `GITHUB_TOKEN`)를 쓴다.
5. App 토큰으로 push 한 커밋의 CI·PR 리뷰는 `claude[bot]` 이 시작한 실행이다. action 은 bot 이 시작한 실행을 기본으로 거부하므로
   ci.yml(refine·autofix)과 pr-review.yml 에 `allowed_bots: claude` 를 둔다(@claude 는 사람의 코멘트로만 시작하므로 두지 않는다).

증상과 원인:
- Claude 커밋(`[claude-refine]`·`[claude-autofix]`·`@claude`)에 체크가 하나도 안 붙는다 → push 가 `GITHUB_TOKEN` 으로 나갔다(2·3 이 깨짐).
- `@claude` 가 `fatal: could not read Username` 으로 멈춘다 → 2 의 헤더가 없다.
- Claude 커밋 뒤 품질 리뷰가 "결과를 남기지 못했습니다", PR 리뷰가 "AI 리뷰 없음" → `Workflow initiated by non-human actor` (5 가 빠짐).
- `ci.yml` 을 바꾸는 PR 에서는 refine 이 건너뛴다 — action 이 기본 브랜치와 다른 워크플로에는 App 토큰을 주지 않기 때문(정상).

## 11. Actions 시간은 계정 전체가 나눠 쓴다

GitHub 의 무료 Actions 사용량(Free 월 2,000분)은 리포지토리마다가 아니라 **계정의 모든 비공개 리포지토리 합계**다.
이 템플릿으로 프로젝트를 여러 개 만들면 금방 넘고, 예산이 $0 이면 그 달은 모든 워크플로가 시작조차 하지 않는다
(`The job was not started because ... spending limit`). 그래서 "필요할 때만 돈다" 를 워크플로에 박아 둔다:

| 낭비 | 막는 방법 |
| --- | --- |
| 네이티브 PR 에 push 할 때마다 Android 빌드 + 에뮬레이터(20~60분) | 같은 PR·같은 Android fingerprint·같은 `.maestro/` 로 통과했으면 건너뜀(PR 범위 캐시에 통과 표시). `e2e` 라벨이면 매번 |
| 문서만 바꾼 PR·merge 가 전체 검사·프리뷰·품질 리뷰·OTA 배포까지 | `scripts/ci-changes.mjs` 판정(이름 바꾸기는 옛 경로까지) → test 는 성공으로 바로 끝나고(필수 검사·Risk 의 CI 통과 조건 유지) 나머지 job 은 건너뜀. deploy 는 **마지막 성공 배포** 이후가 문서뿐일 때만 건너뜀 — 앞선 배포가 실패·취소됐으면 그 코드까지 배포한다 |
| draft PR 의 전체 검사 | lint·typecheck 만. Ready for review 이벤트로 전체가 돈다 |
| merge 후 main 에서 같은 test 를 다시 | ci.yml 의 main push 트리거 없음(브랜치 보호로 PR 에서 이미 통과). 필요하면 수동 실행 |
| 출시 전·롤아웃 100% 뒤에도 매일 도는 rollout-monitor(실행마다 npm ci + EAS CLI) | 할 일이 없으면 스스로 disable, release.yml(kind=ota·rollout)이 enable. `actions: write` 는 그 한 줄짜리 job 에만(EXPO_TOKEN 을 쓰는 job 에는 주지 않는다) |
| Claude job 이 멈추면 기본 한도 6시간 과금 | refine·autofix 30분, @claude 45분 timeout |

`test` 를 job 단위로 건너뛰지 않는 이유: 브랜치 보호의 필수 체크이고, `scripts/risk/cli.mjs ci` 가 `test == success` 를 CI 통과
조건으로 본다(skipped 면 AI 리뷰가 "CI 실패" 로 빠진다). 그래서 job 은 돌되 스텝을 건너뛴다(1분).
EAS 클라우드 빌드는 원래 fingerprint 가 바뀔 때만 만들고 `--no-wait` 라 Actions 가 기다리지 않는다.
