# 최초 1회 설정

mobile-bootstrap 리포지토리에 한 번만 해 두면, 이후 새 앱 프로젝트는 워크플로 실행 한 번이다.
아래 표의 계정은 모두 **무료로 시작**할 수 있다(스토어 계정은 출시할 때 — `docs/STORE-LAUNCH.md`).

## 0. 계정과 요금 (2026-10 조사 기준 — 요금표에서 재확인)

| 서비스 | 시작 플랜 | 언제 올리나 |
| --- | --- | --- |
| Expo (EAS) | Free — 월 Android 15 + iOS 15 빌드, OTA 월 1,000 MAU, 저우선 빌드 큐 | 빌드가 모자라거나 큐가 너무 길 때 Starter($19/월) |
| Supabase | Free — 프로젝트 2개, 7일 요청이 없으면 일시정지, 백업 없음 | 실제 사용자가 생기면 Pro($25/월/프로젝트) + 필요하면 PITR |
| Sentry | Developer(무료) | 이벤트가 많아지면 |
| GitHub | Free 가능 | 비공개 리포에 브랜치 규칙(필수 체크)을 걸려면 Pro(개인) |
| Claude | API 키 또는 구독 토큰 | 리뷰가 push 마다 돈다 — 사용량을 보고 한도를 건다 |
| Apple Developer | 출시 때 $99/년 | iPhone 에 TestFlight 로 설치하려면 필요 |
| Google Play | 출시 때 $25(1회) | 개인 계정은 **12명·14일 비공개 테스트** 후 출시 — 일찍 만들수록 좋다 |

자세한 비교와 이유는 [STACK.md](STACK.md).

## 1. 이 리포지토리를 템플릿으로 지정

GitHub → Settings → General → **Template repository** 체크. (new-project 워크플로는 템플릿 리포지토리에서만 돈다.)

## 2. Claude GitHub App — All repositories

https://github.com/apps/claude → Configure → Repository access → **All repositories**

- 새로 만든 리포지토리를 claude.ai/code 에서 바로 고를 수 있다.
- auto-fix·품질 리뷰가 App 토큰으로 push 하므로 그 push 가 CI 를 다시 돌린다.

## 3. Expo 계정과 토큰

1. https://expo.dev 가입.
2. expo.dev → Account settings → Access tokens → **Robot user** 를 만들고(역할 Developer 이상) 토큰을 발급 → 시크릿 `EXPO_TOKEN`.
3. 변수 `EXPO_ACCOUNT` = **로봇이 속한 조직 이름**. 로봇 사용자는 조직에만 만들 수 있어서, 개인 계정에서 만들면
   Expo 가 조직(예: `hayohan39s-team`)을 만들어 그 안에 둔다. 개인 계정 이름(`hayohan39`)을 넣으면
   `You do not have access to the "hayohan39" account` 로 EAS 연결이 실패한다 — 그 오류 메시지 끝에 나오는 이름을 넣으면 된다.
   로봇 토큰은 사람 계정 비밀번호와 분리돼 있어, 새면 그 토큰만 지우면 된다.

## 4. Supabase 토큰

1. https://supabase.com 가입 → 조직(Organization) 생성. Organization → Settings 의 **slug** → 변수 `SUPABASE_ORG_ID`.
2. Account → Access Tokens → 새 토큰 → 시크릿 `SUPABASE_ACCESS_TOKEN`.
   (새 프로젝트를 만들고, 마이그레이션 상태·Edge Function 배포에 쓰인다. 새 프로젝트로도 복사된다.)

## 5. 시크릿 (Settings → Secrets and variables → Actions → Secrets)

| 이름 | 필수 | 용도 | 발급 |
| --- | --- | --- | --- |
| `BOOTSTRAP_PAT` | ✅ | 새 리포지토리 생성, 시크릿/변수/라벨/브랜치 규칙, 초기화 push | **classic** PAT, 스코프 `repo` + `workflow` — https://github.com/settings/tokens/new |
| `ANTHROPIC_API_KEY` | ✅* | Actions 안의 Claude (리뷰·Risk, auto-fix, 품질 리뷰, @claude) | https://console.anthropic.com/settings/keys |
| `CLAUDE_CODE_OAUTH_TOKEN` | * | 위와 같음, 구독 사용량으로 | 터미널에서 `claude setup-token` |
| `EXPO_TOKEN` | ✅ | EAS 프로젝트 연결·빌드·OTA·제출 | 3번 |
| `SUPABASE_ACCESS_TOKEN` | ✅ | Supabase 프로젝트 생성, Edge Function 배포 | 4번 |
| `SENTRY_AUTH_TOKEN` | 선택 | 소스맵 업로드, 롤아웃 감시(crash-free 조회) | Sentry → Settings → Auth Tokens (project:read, project:releases, org:read) |
| `BOT_PAT` | 선택 | Claude App 없이 auto-fix push 가 CI 를 재실행하게 | **별도 머신 계정**의 fine-grained PAT |

\* 둘 중 하나. `BOOTSTRAP_PAT` 외의 시크릿은 새 프로젝트로 **자동 복사**된다.

프로젝트마다 자동으로 만들어지는 것: Supabase 프로젝트(서울 리전), 시크릿 `SUPABASE_DB_URL`(Session pooler),
변수 `SUPABASE_PROJECT_REF`·`EAS_PLATFORMS=android`, EAS 프로젝트와 `app.json` 연결, EAS 환경변수
`EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 라벨, main 브랜치 규칙.

## 6. 변수 (Settings → Secrets and variables → Actions → Variables)

| 이름 | 필수 | 기본값 | 의미 |
| --- | --- | --- | --- |
| `EXPO_ACCOUNT` | ✅ | — | EAS 프로젝트를 만들 Expo 조직 이름(로봇 토큰이 속한 곳, 예: `hayohan39s-team`) |
| `SUPABASE_ORG_ID` | ✅ | — | Supabase 조직 slug |
| `SUPABASE_REGION` | | `ap-northeast-2`(서울) | 새 Supabase 프로젝트 리전 |
| `SENTRY_ORG` | | — | Sentry 조직 slug (프로젝트마다 `SENTRY_PROJECT` 는 따로) |
| `EAS_CLI_VERSION` | | `latest` | 워크플로가 설치하는 eas-cli 버전(문제 생기면 고정) |
| `CLAUDE_MODEL` | | `claude-sonnet-5-5` | auto-fix · 품질 리뷰 · @claude |
| `CLAUDE_REVIEW_MODEL` | | `claude-sonnet-5-5` | PR 리뷰·Risk (규칙 스캔이 HIGH 미만) |
| `CLAUDE_REVIEW_MODEL_HIGH` | | `claude-opus-5-5` | PR 리뷰·Risk (규칙 스캔이 HIGH 이상) |

프로젝트별 변수(새 프로젝트 쪽에서 바꿈): `EAS_PLATFORMS`(`android` → Apple 계정 연결 후 `all`), `SENTRY_PROJECT`,
`AUTOFIX_MAX_ATTEMPTS`(3), `CLAUDE_REVIEW`·`CLAUDE_REFINE`(`false` 면 끔), `REFINE_MAX_ROUNDS`(1),
`ROLLOUT_HALT_BELOW`(0.99)·`ROLLOUT_ADVANCE_ABOVE`(0.995)·`ROLLOUT_MIN_SESSIONS`(30).

## 7. (선택) 클라우드 세션에서 EAS·Supabase 에 직접 접속하기

기본 설정의 클라우드 세션은 expo.dev·supabase.com·sentry.io 에 접속하지 못한다(이 템플릿은 그래도 동작하도록
그 작업을 모두 GitHub Actions 에서 한다). 세션에서 직접 `eas`·`supabase` 를 쓰거나 Expo 문서를 읽게 하려면:
세션 제목 줄의 클라우드 환경 메뉴 → Edit → **Network access** 에서 더 넓은 수준을 고르거나, Allowed domains 에
`expo.dev`, `api.expo.dev`, `docs.expo.dev`, `u.expo.dev`, `api.supabase.com`, `supabase.com`, `sentry.io` 를 추가한다
("Allow package managers" 는 켠 채로). 안내: https://code.claude.com/docs/en/cloud-environments#network-access

## 8. 브랜치 보호 (new-project 가 실패했을 때 수동으로)

새 프로젝트의 Settings → Rules → Rulesets → New branch ruleset:
Target: Default branch, Enforcement: Active, Restrict deletions, Block force pushes,
Require a pull request (승인 수 0), Require status checks: `test`, `risk-gate`.

## 9. 확인

claude.ai/code 에서 mobile-bootstrap 으로 세션을 열고 "테스트용 앱 hello-mobile 만들어줘".

1. Actions 의 New project 가 초록, 요약에 Supabase·EAS 연결 success
2. 새 리포지토리의 Deploy (staging) 가 초록 — "🧱 새 스테이징 빌드" (EAS 무료 큐는 수십 분)
3. 빌드가 끝나면 EAS 링크에서 **APK 를 Android 폰에 설치** → 앱 정보 화면에 채널 `staging`, 백엔드 "연결됨"
4. 화면 문구만 바꾸는 PR → CI · PR 종합 코멘트(Risk) · 📱 프리뷰(⚡ OTA, 웹 링크) → merge → "📦 OTA" → 앱을 다시 열면 반영
5. `release.yml kind=ota` 는 프로덕션 빌드가 있어야 한다 — 스토어 계정 전에는 여기까지가 확인 범위

확인 후 지우려면: GitHub 리포지토리, Supabase 프로젝트, expo.dev 프로젝트를 각각 삭제.
