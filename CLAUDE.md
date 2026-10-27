@AGENTS.md

<!-- template-only:start -->
> **여기는 템플릿 리포지토리(mobile-bootstrap)다.** 아래 내용은 이 템플릿으로 만든
> 프로젝트용이다. 템플릿 자체를 고칠 때는 `docs/bootstrap/MAINTAINING.md` 를 먼저 읽는다.
> 새 프로젝트를 만들어 달라는 요청이면 `new-project` 스킬을 따른다.
<!-- template-only:end -->

# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

**스토어에 출시해 실제 사용자가 쓰는 Android·iOS 앱이다.** 리포지토리 주인(이하 "사용자")은 Claude 세션에서
개발을 요청하고, GitHub 에서 PR 종합 코멘트(CI · 코드 리뷰 · Risk Score)를 보고 merge 할지 정한다.
merge 는 **스테이징(내부 테스트 채널) 배포**이고, 사용자에게 나가는 **출시(release)는 사용자의 별도 요청**으로 한다.

## 역할 분담

| 누가 | 무엇을 |
| --- | --- |
| 사용자 | 요청 · PR 판단(CRITICAL 포함) · **merge** · 폰에서 스테이징 확인 · **출시 지시** · 스토어 콘솔 작업(심사 제출 버튼, 스토어 정보, 계정·결제·키) |
| Claude (세션) | 브랜치 → 구현 → 로컬 검증 → 커밋 → push → **PR 생성** → CI·리뷰·Risk 보고 → 지적 수정 → (요청 시) release 워크플로 실행·결과 보고 |
| GitHub Actions | CI · auto-fix · PR 프리뷰(웹 + OTA) · AI 리뷰 + Risk Score · merge 후 DB 마이그레이션 → 스테이징 OTA 또는 빌드 · 출시 · 롤아웃 감시 · 롤백 |
| EAS (Expo) | 클라우드 빌드(iOS 포함 — Mac 불필요) · 서명 키 보관 · 스토어 제출 · OTA 업데이트 배포 |

## 개발 요청을 받으면

1. **main 에서 새 브랜치**를 딴다: `claude/<짧은-설명>` (세션이 브랜치를 정해 줬으면 그걸 쓴다).
   `git fetch origin main` 후 최신 main 기준으로 시작한다.
2. 요청이 모호하거나 **인프라/비용/외부 서비스/개인정보/새 권한(카메라·위치·연락처 등)/결제** 가 새로 필요한
   결정이면 구현 전에 먼저 묻는다(아래 "인프라 결정", "스토어 규정"). 그 외에는 합리적으로 판단해 진행하고 PR 에 적는다.
3. 구현한다. **한 PR 에 한 목적.** 무관한 리팩터링은 하지 않는다. **네이티브 변경**(아래)은 JS 변경과 섞지 않고
   따로 작은 PR 로 낸다 — 네이티브 변경은 새 빌드·스토어 심사가 필요하고 되돌릴 수 없어서 Risk 가 높다.
4. **push 전에 diff 를 스스로 다듬는다**: `.github/review/quality.md` 기준(덧붙임·재사용·단순화·일관성·빈틈)으로
   `git diff origin/main...HEAD` 를 한 번 훑는다. 세션에 `/simplify` 스킬이 있으면 그걸 써도 된다.
   그리고 **반드시** `npm run check` (lint → typecheck → test → 웹 export → 웹 스모크) 를 통과시킨다.
   DB 를 건드렸으면 `npm test` 가 로컬 Postgres 에 마이그레이션을 적용하고 RLS 테스트까지 돈다(아래 참고).
5. **예상 Risk 를 먼저 본다**: `node scripts/risk/cli.mjs scan --base origin/main --head HEAD`
   (규칙 기반 최저치. 최종 점수는 CI 뒤 AI 리뷰가 더한다.) HIGH 이상이면 PR 본문 **롤백 계획**,
   VERY HIGH 이상이면 **배포 후 확인**까지 구체적으로 쓴다.
6. 커밋 메시지는 Conventional Commits, 제목은 한국어 가능: `feat: 단어장 화면 추가`.
7. push 후 **PR 을 만든다**. 본문은 `.github/pull_request_template.md` 형식으로 파일에 쓰고:
   `node scripts/gh.mjs pr-create --title "feat: ..." --body-file /tmp/pr.md`
   빈 섹션을 남기지 않는다. 사용자는 휴대폰으로 본다 — 첫 줄에서 무엇이 바뀌는지 알 수 있게.
8. `node scripts/gh.mjs pr-watch` 로 CI 와 PR 리뷰(종합 코멘트)가 끝날 때까지 기다린 뒤 두세 줄로 보고한다:
   CI 결과 · 리뷰 판정과 주요 지적 · **Risk 등급과 빠진 확인 사항** · **프리뷰(웹 링크, OTA 여부 또는 "새 빌드 필요")**.
   merge 를 막는 게이트는 없다(필수 체크는 `test` 뿐). HIGH 이상이면 사용자가 무엇을 보고 merge 할지 분명히 적는다.
   - 리뷰 finding(blocker/major)은 같은 브랜치에서 고쳐 push 한다. 고치지 않을 것은 이유를 PR 에 쓴다.
9. **merge 하지 않는다.** 사용자가 요청해도 "PR 에서 merge 버튼을 눌러 주세요" 라고 안내한다.

PR 이 이미 열려 있는 브랜치에서 추가 요청을 받으면 같은 브랜치에 커밋을 더한다.
그 전에 `git pull origin <브랜치>` — CI 가 `[claude-refine]`·`[claude-autofix]` 커밋을 더했을 수 있다.

### 네이티브 변경 vs JS 변경 (가장 중요한 구분)

앱은 **설치된 바이너리(네이티브)** 위에서 **JS 번들**이 돈다. `app.json` 의 `runtimeVersion: fingerprint` 가
네이티브에 영향을 주는 모든 것(네이티브 의존성, `app.json` 의 네이티브 설정, config plugin, Expo SDK)을 해시한다.

| | JS 변경 (fingerprint 같음) | 네이티브 변경 (fingerprint 바뀜) |
| --- | --- | --- |
| 예 | 화면, 로직, 문구, 이미지, 순수 JS 라이브러리 | `npx expo install` 한 네이티브 모듈, 권한, 아이콘·스플래시, 플러그인, SDK 업그레이드 |
| 배포 | **OTA 업데이트** — 몇 분, 심사 없음 | **새 빌드 → 스토어 심사** — 하루~며칠 |
| 되돌리기 | `eas update` 롤백으로 즉시 | **불가.** 롤아웃 중단·핫픽스 빌드만 가능 |
| 사용자 테스트 | 이미 설치한 스테이징 앱이 자동으로 받음 | 사용자가 새 스테이징 빌드를 설치해야 함 |

PR 프리뷰 코멘트와 Risk 가 이 구분을 자동으로 보여 준다. 네이티브 변경이면 PR 본문 "배포 영향" 에 **새 빌드 필요** 를 쓴다.
**OTA 로 앱의 핵심 목적을 바꾸지 않는다**(Apple 가이드라인 2.5.2/3.3.2) — 버그 수정·기능 개선은 괜찮다.

### Risk Score 를 대하는 태도

- 기준은 `.github/risk/rubric.md`. Risk 는 품질 점수가 아니라 "사용자 폰에서 잘못되면 얼마나 아픈가" 다.
- **점수를 낮추려고 위험을 숨기지 않는다.** 스캐너를 피하려고 코드를 쪼개거나, 형식적인 테스트를 추가하거나,
  확인하지 않은 주장을 PR 본문에 쓰지 않는다. 위험은 작게 나누기, expand/contract, 테스트, 원격 킬스위치로 줄인다.
- `risk:*` 라벨, PR 리뷰 상태는 **절대 건드리지 않는다.** 위험을 받아들이고 merge 하는 것은 사람의 몫이다.
- `.github/risk/*`, `scripts/risk/*`, `.github/workflows/pr-review.yml` 을 바꾸는 것은
  평가 기준 자체를 바꾸는 일이다. 사용자가 명시적으로 요청했을 때만 하고, 별도 PR 로 한다.

> **GitHub CLI 주의**: 클라우드 세션의 GitHub 프록시는 GraphQL 을 막는다. `gh pr create`,
> `gh pr list/checks/view`, `gh workflow run` 은 403 이 난다. `scripts/gh.mjs`(REST)나
> `gh api repos/{owner}/{repo}/...`, `gh run list/view` 를 쓴다. 세션이 PR 생성 도구를
> 따로 제공하면 그걸 써도 된다. `gh` 가 없으면 세션 시작 훅이 설치를 시도한다.

> **세션 네트워크 주의**: 세션은 expo.dev·supabase.com·sentry.io 에 접속하지 못할 수 있다(환경 설정에 따름).
> 그래서 `eas`·`supabase`(원격)·Sentry 작업은 GitHub Actions 워크플로가 한다. 세션에서는 npm·GitHub 만 있으면 된다.

## 출시해 달라고 하면 ("release 해줘", "사용자들한테 내보내 줘")

`docs/runbook.md` 의 "출시" 절차를 따른다. 요약:

1. `node scripts/gh.mjs deploys` 로 스테이징에 무엇이 있는지(마지막 merge, OTA/빌드) 확인하고, 사용자가 폰에서
   스테이징을 확인했는지 묻는다. 확인 전이면 출시하지 않는다.
2. **JS 변경만 쌓였으면 OTA 출시**: `node scripts/gh.mjs dispatch release.yml kind=ota rollout=10`
   → 롤아웃 감시(rollout-monitor)가 오류율을 보며 10 → 50 → 100% 로 올리거나 멈춘다.
3. **네이티브 변경이 있으면 스토어 출시**: `node scripts/gh.mjs dispatch release.yml kind=store`
   → 프로덕션 빌드 → Play 프로덕션 트랙 단계적 출시 / App Store Connect 업로드. iOS 는 사용자가
   App Store Connect 에서 **심사 제출(단계적 출시 켜기)** 버튼을 눌러야 한다 — 체크리스트로 안내한다.
4. 결과를 두세 줄로 보고한다(무엇이, 몇 %에게, 다음 단계).

## 장애·롤백 요청을 받으면

`docs/runbook.md` 를 따른다. **먼저 복구, 원인은 나중.**
- OTA 로 나간 JS 문제: `node scripts/gh.mjs dispatch rollback.yml reason="..."` → 직전 업데이트로 되돌린다(몇 분).
- 스토어 빌드 문제: 되돌릴 수 없다. Play 단계적 출시 중지·App Store 단계적 출시 일시정지(사용자가 콘솔에서), 그리고
  **원격 킬스위치**(기능 끄기)·**최소 지원 버전**(강제 업데이트) 을 쓰고 핫픽스를 낸다 — `docs/recipes/remote-config.md`.
- DB 복구(백업/PITR)는 데이터에 영향이 크므로 절차를 설명하고 사용자의 결정을 받는다.

## 개발 상황을 물으면

`project-status` 스킬을 따른다. 열린 PR 과 각 CI·리뷰·**Risk**·네이티브 여부, 스테이징·프로덕션에 나간 것
(OTA 업데이트·빌드·롤아웃 %), 스토어 심사 상태(알 수 있으면), `docs/decisions.md` 의 미결 항목을 짧게 정리한다.

## 파이프라인 (건드리기 전에 이해할 것)

```
PR 생성/push ─► ci.yml
                 ├ test     마이그레이션 append-only · lint · typecheck · vitest(+로컬 Supabase DB·RLS) · jest · 웹 export · Playwright · expo-doctor
                 ├ preview  fingerprint 비교(네이티브 변경?) · EAS Update(branch pr-<n>) · 웹 프리뷰 → PR 코멘트
                 ├ e2e      (네이티브 변경 또는 `e2e` 라벨) Android 빌드 → 에뮬레이터 Maestro — 같은 PR·같은 네이티브 상태로 통과했으면 다시 안 돎
                 ├ refine   통과하면 Claude 품질 리뷰 → 작은 정리는 [claude-refine] 커밋 (push 당 1회)
                 └ autofix  실패하면 Claude 가 고쳐서 [claude-autofix] 커밋 (PR 당 최대 3회)
                 (문서만 바뀐 PR: test 가 바로 성공으로 끝나고 나머지는 건너뜀)
CI 완료 ─► pr-review.yml (main 의 코드로 실행)  규칙 스캔 → Claude 리뷰 + Risk → PR 종합 코멘트 · 라벨 (merge 를 막지 않음)
PR 코멘트 @claude ─► claude-mention.yml  지시대로 수정
merge ─► deploy.yml (= 스테이징)  DB 마이그레이션(프로덕션 Supabase) → Edge Functions →
                                  fingerprint 같은 스테이징 빌드가 있으면 OTA(staging) / 없으면 스테이징 빌드(내부 배포)
                                  (문서만 바뀐 merge 는 배포하지 않음. main push 에서 CI 는 다시 돌지 않음)
요청 ─► release.yml  kind=ota: 스테이징 업데이트를 production 채널로 (rollout %) / kind=store: 프로덕션 빌드 → 스토어 제출
매일 ─► rollout-monitor.yml  Sentry 오류율로 OTA 롤아웃을 올리거나 멈추고 이슈로 알림
                              (진행 중인 롤아웃이 없으면 스스로 꺼짐 → release.yml 이 OTA 를 낼 때 다시 켬)
수동 ─► rollback.yml  production OTA 를 직전 업데이트로 되돌리기
PR 닫힘 ─► preview-cleanup.yml  EAS Update 의 pr-<n> 브랜치 정리
```

- 워크플로를 고칠 때는 그 이유를 PR 에 적는다. 시크릿 값을 로그에 찍지 않는다.
- **Actions 시간은 계정의 모든 비공개 리포지토리가 나눠 쓴다**(GitHub Free 월 2,000분 · Pro 3,000분, 넘으면 예산만큼 과금 —
  예산이 $0 이면 그 달은 모든 워크플로가 멈춘다). JS push 한 번에 약 10분, 네이티브 PR 의 e2e 는 20~60분이다.
  그래서: `npm run check` 를 통과한 뒤 커밋을 모아 한 번에 push 한다(작은 수정마다 push 하지 않는다).
  위의 건너뛰기 규칙을 깨는 변경(새 워크플로, 새 schedule, 매 push 마다 도는 job)은
  PR 본문에 예상 사용 시간을 쓴다. 품질 리뷰(refine) 커밋도 CI 를 한 번 더 돌린다 — 바쁜 달에는 변수 `CLAUDE_REFINE=false` 로 끌 수 있다.
- 스테이징 앱과 프로덕션 앱은 **같은 Supabase DB** 를 쓴다. 그래서 DB 변경은 merge 순간 프로덕션 사용자에게도 적용된다
  — 아래 expand → contract 규칙이 이를 안전하게 한다.

## 스택

- Expo SDK 57 (React Native 0.86, New Architecture) + Expo Router(`src/app`) + TypeScript. **AGENTS.md 경고대로**
  학습 데이터와 다를 수 있다. 새 API 를 쓰기 전에 문서나 `node_modules` 의 타입 선언을 확인한다.
- 의존성은 **`npx expo install <pkg>`** 로 추가한다(SDK 호환 버전). 네이티브 코드가 있는 패키지는 네이티브 변경이다.
- `ios/`·`android/` 폴더는 만들지 않는다(CNG). 네이티브 설정은 `app.json` 과 config plugin 으로만.
- 백엔드: Supabase — Postgres(RLS) + Auth + Storage + Realtime + Edge Functions(`supabase/functions`, Deno).
  클라이언트는 `src/lib/supabase.ts`. 오프라인 우선 데이터는 `expo-sqlite`(`docs/recipes/offline-sync.md`).
- 관측: Sentry(`@sentry/react-native`, DSN 이 있을 때만), 구조화 로그 `src/lib/log.ts`, 앱 정보(`src/lib/build-info.ts`).
- 기본 기능(이미 있음): 이메일 코드 로그인 + Apple/Google(설정 후 켬) `src/lib/auth.tsx`, 계정 삭제(앱·웹 + Edge Function
  `delete-account`), 푸시 토큰 `src/lib/push.ts`, 원격 설정(킬스위치·최소 지원 버전·점검) `src/lib/app-config.ts` + `AppGate`,
  정책 페이지 `/privacy`·`/terms`·`/delete-account`(웹 export 로 공개 URL). 공용 컴포넌트 `Screen`·`Text`·`Button`·`TextField`.
- 테스트: vitest(`test/**` — 순수 로직·스크립트·DB/RLS), jest-expo + Testing Library(`src/**/*.test.tsx` — 화면),
  Playwright(`e2e/web` — 웹 export 스모크), Maestro(`.maestro/` — CI 의 Android 에뮬레이터).
- Node 22 (`.nvmrc`). 확정된 인프라와 이유는 `docs/decisions.md`.

## 데이터베이스 규칙 (Supabase)

- 스키마 변경은 **반드시** `supabase/migrations/` 의 SQL 파일로. `npm run db:new -- <이름>` 으로 만든다.
- **이미 main 에 들어간 마이그레이션 파일은 절대 수정하지 않는다.** CI 가 막는다.
- **모든 테이블에 RLS 를 켜고 정책을 쓴다.** 앱의 키는 공개 키라서 RLS 가 유일한 보호막이다.
  새 테이블에는 "남의 행은 읽지도 쓰지도 못한다" 를 확인하는 테스트를 `test/db/` 에 넣는다(`actAs` 도우미).
- **구버전 앱이 몇 달씩 남는다.** 스토어 앱은 사용자가 업데이트하지 않으면 그대로다. 그래서 expand → contract:
  1. 추가만 하는 PR(새 컬럼은 nullable 또는 상수 DEFAULT) → 2. 앱이 새 구조를 읽고 쓰는 PR(출시) →
  3. 최소 지원 버전을 올린 뒤에만 옛 컬럼·RPC·Edge Function 입력을 지우는 PR.
  현재 출시된 앱이 쓰는 이름을 지우거나 바꾸면 Risk 가 CRITICAL 이 된다.
- 큰 테이블 백필은 범위를 나눠 여러 번. 파괴적 변경은 PR 본문 "롤백 계획" 에 복구 방법(백업·PITR)을 쓴다.
- SQL·RPC 는 항상 파라미터로. `security definer` 함수는 `set search_path = ''` 와 권한 확인을 넣는다.
- 로컬 검증: 세션 시작 훅이 로컬 Postgres 를 켜고 `TEST_DATABASE_URL` 을 설정한다. `npm test` 가 마이그레이션을
  적용하고(`supabase/local-shim.sql` 이 Supabase 의 auth 기본기를 흉내) DB 테스트를 돌린다. 브랜치를 오가며
  스키마가 꼬이면 `npm run db:reset`. CI 는 진짜 Supabase 로컬 DB 에서 같은 테스트를 돈다.

## 스토어 규정 (기능을 만들기 전에 확인)

자세한 체크리스트는 `docs/STORE-LAUNCH.md`. 기능을 만들 때 걸리는 것:

- **로그인**: 소셜 로그인(Google 등)을 넣으면 **Sign in with Apple 도** 넣는다(Apple 4.8) — `docs/recipes/auth.md`.
- **계정 삭제**: 가입이 있으면 앱 안에서 **계정 삭제**가 가능해야 하고(Apple 5.1.1(v)), Google 은 **웹 삭제 링크**도 요구한다.
- **사용자 생성 콘텐츠**(글·댓글·사진·채팅): 신고·차단·필터·운영자 연락처가 필수(Apple 1.2) — `docs/recipes/ugc-moderation.md`.
- **디지털 상품·구독**은 인앱결제(IAP)만(Apple 3.1.1, Google Play 결제 정책). 실물·숙박 예약은 외부 결제 가능 — `docs/recipes/monetization.md`.
- **권한**(카메라·사진·위치·연락처·추적): 꼭 필요할 때만, 쓰기 직전에 요청하고, `app.json` 에 한국어 사용 목적 문구를 쓴다.
  광고 추적은 ATT 동의가 필요하다. 권한 추가는 네이티브 변경이며 스토어 개인정보 라벨/Data safety 를 갱신해야 한다.
- **위치 기반 서비스**는 한국 위치정보법 신고 대상인지 먼저 확인한다 — `docs/recipes/location.md`. 사용자에게 묻는다.
- 새 SDK(광고·분석·결제)를 넣으면 iOS privacy manifest·개인정보 라벨·Data safety 갱신 항목을 PR "배포 영향" 에 쓴다.

## 보안·개인정보

- 쓰기(INSERT/UPDATE/DELETE, RPC, Edge Function)는 **인증과 RLS/권한 확인 없이 열지 않는다.**
- 비밀값(service_role 키, 외부 API 키)은 **앱에 넣지 않는다** — `EXPO_PUBLIC_*` 는 누구나 꺼내 볼 수 있다.
  비밀이 필요한 호출은 Edge Function 에서 하고 키는 Supabase secret 으로.
- 외부 입력은 경계(Edge Function, RPC)에서 검증한다. 오류 메시지에 SQL·내부 정보를 노출하지 않는다.
- 로그·Sentry 로 개인정보(이메일, 전화번호, 토큰, 위치, 메시지 본문)를 보내지 않는다.
- 토큰 같은 민감값을 기기에 저장할 때는 `expo-secure-store`. AsyncStorage 는 암호화되지 않는다.

## 환경변수와 비밀값

- 비밀값을 커밋하지 않는다. `.env*`, 서명 키(`*.jks`, `*.p8`, `*.p12`), 서비스 계정 JSON 은 gitignore 되어 있고 Claude 는 읽지 않는다.
- 앱 변수는 `src/lib/env.ts` 의 `ENV_DOCS`·`PUBLIC_ENV` 에 이름·용도·발급처를 적는다(`EXPO_PUBLIC_*` 만).
  값은 **EAS 환경변수**(production / preview / development)에 사용자가 넣는다. PR 본문 "배포 영향" 에 적는다.
- Edge Function 비밀값은 `supabase secrets set` — 워크플로가 GitHub 시크릿에서 옮기거나 사용자가 대시보드에서 넣는다.
- Claude 가 대신 설정할 수단이 있어도 먼저 묻는다.

## 인프라 결정

Expo/EAS(빌드·제출·OTA), Supabase(백엔드), Sentry(오류 추적), GitHub Actions(CI/CD)는 고정이다(`docs/decisions.md`).
그 밖의 것(결제, 광고, 푸시 외 알림, 지도, 분석, 이미지 처리, 외부 API)이 필요해 보이면:

1. 구현 전에 선택지 2~3개를 **비용·운영 부담·락인·개인정보/스토어 규정**으로 짧게 비교해 제안하고 결정을 받는다.
   레시피(`docs/recipes/`)가 있으면 그것부터 본다.
2. 결정되면 `docs/decisions.md` 에 기록한다(날짜, 결정, 이유, 대안, 비용, 되돌리는 법).
3. 계정 가입·키 발급·스토어 콘솔 설정처럼 사용자만 할 수 있는 일은 체크리스트로 알려 준다.

## 코드 규칙

- 화면은 `src/app/`(Expo Router), 그 밖의 코드는 `src/components`·`src/lib`·`src/features/<기능>`. `src/app` 안에 테스트를 두지 않는다.
- 경로는 `path.join`, 임시 디렉터리는 `os.tmpdir()`. npm scripts 에 POSIX 전용 문법 금지.
- 테스트를 지우거나 skip 해서 통과시키지 않는다. `eslint-disable` / `@ts-ignore` 로 덮지 않는다.
- 바뀐 동작에는 그 동작을 검증하는 테스트를 같은 PR 에 넣는다(Risk 의 Testing factor).
- 로그는 `console.log` 대신 `src/lib/log.ts` 의 `log`.
- 사용자에게 보이는 문구는 한국어가 기본. 웹에서도 깨지지 않게(`Platform.OS === "web"` 분기, `*.web.tsx`) 만든다 —
  웹 export 는 CI 의 스모크 테스트와 PR 웹 프리뷰에 쓰인다.

## 명령

```bash
npm run check           # lint + typecheck + test + 웹 export + 웹 스모크 (push 전 필수)
npm test                # vitest(로직·DB/RLS) + jest(화면)
npm run web             # 로컬 웹 개발 서버
npm run db:new -- add_decks     # 새 마이그레이션
npm run db:apply | db:status | db:reset   # 로컬 DB (TEST_DATABASE_URL)
node scripts/risk/cli.mjs scan --base origin/main --head HEAD   # 예상 Risk (규칙 기반)
node scripts/gh.mjs pr-list      # 열린 PR + CI + Risk (pr-create / pr-status / pr-watch / deploys / risk-history)
node scripts/gh.mjs dispatch release.yml kind=ota rollout=10      # 출시 (사용자 요청 시)
node scripts/gh.mjs dispatch rollback.yml reason="..."            # OTA 롤백
```
