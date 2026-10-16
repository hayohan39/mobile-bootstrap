# 문제 해결

운영 중 장애·출시·롤백은 프로젝트의 [docs/runbook.md](../runbook.md). 여기는 템플릿·파이프라인 설정 문제.

## 새 프로젝트 생성

**New project 가 아예 안 돎 / job 이 skipped** — 리포지토리가 템플릿으로 지정되지 않았다([SETUP.md](SETUP.md) 1번).

**`BOOTSTRAP_PAT 시크릿이 없습니다`** / 초기화 push 가 `refusing to allow ... workflow` — classic PAT 에 `repo`+`workflow` 스코프.

**Provision Supabase 실패**
- `SUPABASE_ORG_ID 가 없습니다` — 변수에 조직 **slug**(숫자 id 아님).
- 무료 플랜 프로젝트 한도(2개) — 안 쓰는 프로젝트를 지우거나 Pro. 그 뒤 같은 이름으로 재실행.
- 10분 안에 준비되지 않음 — Supabase 상태 페이지 확인 후 재실행(만들어진 프로젝트는 재사용된다).

**요약에 "DB 비밀번호를 모릅니다"** — 이미 있던 Supabase 프로젝트를 재사용했다. Supabase → Connect → **Session pooler**
연결 문자열(비밀번호 포함)을 새 리포지토리 시크릿 `SUPABASE_DB_URL` 에. 비밀번호를 모르면 Database → Settings 에서 재설정.

**EAS 프로젝트 연결 실패** — `EXPO_TOKEN`(로봇 토큰의 역할이 Developer 이상인지), `EXPO_ACCOUNT` 가 로봇이 속한 **조직** 이름인지.
`You do not have access to the "<이름>" account. Accounts you have permissions to create projects in: <조직>` 이면
템플릿 변수 `EXPO_ACCOUNT` 를 `<조직>` 으로 바꾸고 new-project 를 **같은 이름으로 다시 실행**한다(EAS 연결만 다시 한다).
고친 뒤 같은 이름으로 재실행하면 초기화는 건너뛰고 EAS 연결만 한다.

**`Protect main` 실패** — 비공개 리포의 브랜치 규칙은 GitHub Pro 가 필요하다. [SETUP.md](SETUP.md) 8번.

## CI

**`test` 의 `Start local Supabase database` 실패** — Docker 이미지 받기 실패(일시적) → Re-run. 계속되면 Supabase CLI 버전
(`package.json` 의 `supabase`)을 확인.

**`Expo dependency versions`(`expo install --check`) 실패** — SDK 와 맞지 않는 버전의 패키지가 들어왔다. 세션에서
`npx expo install --fix` 후 커밋. Dependabot 이 Expo 패키지를 올리지 않게 막아 두었다(`.github/dependabot.yml`).

**`fingerprint` job 실패** — base 쪽 `npm ci` 실패(옛 lockfile)거나 `app.json` 이 깨졌다. 로그의 `runtimeversion:resolve` 오류를 본다.

**`preview` 건너뜀** — `EXPO_TOKEN` 또는 `app.json` 의 `extra.eas.projectId` 가 없다(프로비저닝 전).
**웹 프리뷰 실패** — EAS Hosting 첫 배포에는 프로젝트별 서브도메인이 필요하다. 로그에 dev-domain 안내가 있으면
세션에서 Claude 에게 "EAS Hosting 도메인 설정해줘" — 워크플로에 `--dev-domain` 을 한 번 넣는다.
**앱 프리뷰(OTA) 가 "🧱 새 빌드 필요"** — 네이티브 변경 PR 이라 기존 개발 빌드에서 열 수 없다(정상).

**`e2e` 실패** — 업로드된 `maestro-report` 아티팩트의 스크린샷을 본다. 앱이 뜨자마자 죽으면 대개 네이티브 설정(권한·플러그인)
또는 시작 경로(`_layout.tsx`) 예외다. 에뮬레이터 부팅 타임아웃은 Re-run.

**PR 종합 코멘트가 안 붙음 / `risk-gate` 대기** — production-bootstrap 과 같다: `pr-review.yml` 은 main 에 있는 버전만 돈다,
CI 가 취소됐으면 다음 커밋에서 붙는다, Actions → PR review → Re-run.

**품질 리뷰·auto-fix 가 안 돎** — `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`, `no-refine`/`no-autofix` 라벨,
`ci.yml` 을 바꾼 PR(main 과 달라서 App 토큰 검사에 걸림 — merge 후 다음 PR 부터).

## 스테이징·출시

**Deploy 의 `Migrate production database` 실패** — 로그의 SQL 오류. 실패한 파일은 트랜잭션이라 되돌려졌다. 고치는 마이그레이션을
새 파일로 올린다. `connection refused` / IPv6 관련이면 `SUPABASE_DB_URL` 이 직접 연결(db.<ref>.supabase.co)이다 → Session pooler 로.

**Edge Functions 배포 실패** — `SUPABASE_ACCESS_TOKEN`·`SUPABASE_PROJECT_REF` 확인.

**스테이징 빌드가 오래 걸림** — EAS 무료 큐. 월 한도를 넘으면 다음 달까지 멈춘다(expo.dev → Billing).

**iOS 빌드 실패: credentials** — 첫 iOS 빌드는 사람이 자격증명을 한 번 만들어야 한다(`docs/STORE-LAUNCH.md` 1번).

**release `kind=ota` 실패: "프로덕션 빌드가 없습니다"** — 그 runtimeVersion 의 production 빌드가 없다. 네이티브가 바뀌었거나
아직 스토어 출시를 한 번도 안 했다 → `kind=store`.

**release `kind=store` 실패: "마지막 스테이징 배포와 다릅니다"** — merge 후 스테이징 배포가 끝나기 전이거나 실패했다.
확인 후 다시, 또는 `force=true`.

**rollout-monitor 가 롤아웃을 안 올림** — Sentry 설정(`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)이 없거나
세션 수가 적다(`ROLLOUT_MIN_SESSIONS`). 실행 요약에 이유가 있다. 수동: `release.yml kind=rollout percent=100`.
