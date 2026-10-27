# 템플릿 유지보수

이 리포지토리는 **템플릿이자 컨트롤 리포지토리**다.

- 템플릿: "Use this template"/`new-project.yml` 이 이 리포지토리의 main 을 그대로 복사한다.
- 컨트롤: `new-project.yml` 이 리포지토리 생성·Supabase 프로비저닝·EAS 연결·초기화·브랜치 보호를 한다.

## 파일 구분

새 프로젝트로 복사된 뒤 `scripts/init-project.mjs` 가 지우는 **템플릿 전용** 파일(목록은 `TEMPLATE_ONLY`):

- `.github/workflows/new-project.yml`, `.claude/skills/new-project/`
- `scripts/provision.mjs`, `scripts/init-project.mjs`, `test/template/`
- `docs/bootstrap/` (단, `project-README.md` 는 새 프로젝트의 `README.md` 가 된다)
- `CLAUDE.md` 안의 `<!-- template-only:start/end -->` 블록

플레이스홀더 `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{CREATED_AT}}` 는 `src/lib/project.ts`, `CLAUDE.md`,
`README.md`, `docs/decisions.md` 에서만 치환된다. `app.json`(이름·slug·scheme·bundle id)과 `supabase/config.toml`,
`package.json` 은 init-project 가 JSON/정규식으로 고친다 — 템플릿 자신은 `mobile-bootstrap` / `com.example.mobilebootstrap`
로 빌드 가능한 상태를 유지한다.

**프로젝트로 복사되는 것** 중 운영에 중요한 것: `.github/risk/`(rubric·경로 분류 — 프로젝트마다 조정), `scripts/risk/`,
`scripts/release.mjs`, `eas.json`, `docs/runbook.md`, `docs/STORE-LAUNCH.md`, `docs/recipes/`, `docs/decisions.md`.

## 템플릿 리포지토리 자신의 워크플로

- `ci.yml` 의 `test`·`fingerprint`·`e2e`(네이티브 변경 시)는 템플릿에서도 돈다 → 템플릿 앱이 항상 초록인지 확인.
- `preview`, `deploy.yml`, `release.yml`, `rollback.yml`, `rollout-monitor.yml`, `preview-cleanup.yml` 은
  `github.event.repository.is_template` 으로 건너뛴다.
- `pr-review.yml` 은 템플릿 PR 에서도 돈다. main 에 있는 버전이 실행되므로 이 파일이나
  `scripts/risk/` 를 바꾸는 PR 은 **바꾸기 전 규칙**으로 평가된다.

## Expo SDK 를 올릴 때 (1년에 2~3번)

1. 새 SDK 가 stable 이 되고 몇 주 지나 주요 라이브러리가 따라온 뒤에 한다.
2. `npx expo install expo@^<새 버전>` → `npx expo install --fix` → `npx expo-doctor`(CI 에서 네트워크 검사까지).
3. `AGENTS.md` 의 SDK 번호, `CLAUDE.md` 의 스택 절, `docs/decisions.md` 의 기본 스택 항목을 함께 고친다.
4. 이 변경은 모든 생성 프로젝트에 **네이티브 변경**이다 — 각 프로젝트는 별도 PR 과 스토어 출시로 따라간다.

## Risk 규칙을 바꿀 때

1. 기준을 바꾸면 `.github/risk/rubric.md` 와 `scripts/risk/scan.mjs` / `score.mjs` 를 함께 고친다.
2. `test/risk.test.ts` 에 그 규칙의 케이스를 추가한다(SQL 분류, 네이티브·app.json, RLS, floor, override, 게이트).
3. `review-schema.json` 을 바꾸면 홑따옴표(')를 넣지 않는다 — 워크플로가 `--json-schema '<json>'` 로 넘긴다.

## 이미 만든 프로젝트에 템플릿 변경을 반영하려면

자동 동기화는 없다. 그 프로젝트 세션에서 "mobile-bootstrap 의 release 스크립트 변경을 반영해줘" 처럼 요청한다.

## 검증

```bash
npm ci
npm run check                     # lint · typecheck · vitest(템플릿·risk·release·DB) · jest · 웹 export · Playwright
actionlint                        # 워크플로를 바꿨으면 (https://github.com/rhysd/actionlint 릴리스 바이너리)
node scripts/risk/cli.mjs scan --base origin/main --head HEAD
node scripts/fingerprint.mjs resolve                              # 지금 코드의 플랫폼별 runtimeVersion
```

EAS·Supabase 를 실제로 부르는 부분(new-project, deploy, release)은 세션에서 돌릴 수 없다. 바꿨으면 SETUP.md 9번의
테스트 프로젝트로 확인한다.

## 설계 근거

왜 이렇게 만들었는지는 [DESIGN.md](DESIGN.md), 스택 선택은 [STACK.md](STACK.md). 구조를 바꾸기 전에 읽는다.
