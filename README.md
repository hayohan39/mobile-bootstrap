# mobile-bootstrap

Claude 클라우드 세션만으로 **Android·iOS 앱을 개발 → 스토어 출시 → 운영·업데이트** 하는 템플릿.
[production-bootstrap](https://github.com/hayohan39/production-bootstrap)(웹)의 개발 워크플로 — 세션에서 요청하면 Claude 가 PR 을 올리고,
CI·AI 리뷰·Risk Score 를 보고 사람이 merge — 를 모바일에 맞게 옮겼다. Mac 없이 iOS 까지 된다.

| | |
| --- | --- |
| 앱 | Expo SDK 57 (React Native 0.86) + Expo Router + TypeScript — 한 코드로 Android·iOS(·웹 프리뷰) |
| 빌드·제출·OTA | EAS Build / Submit / Update (iOS 는 Expo 의 macOS 에서 빌드) |
| 백엔드 | Supabase — Postgres + RLS, Auth, Storage, Realtime, Edge Functions |
| 품질·운영 | GitHub Actions + Claude(auto-fix · 품질 리뷰 · AI 리뷰 + Risk Score), Sentry, 단계적 롤아웃·롤백 |

## 이 템플릿으로 만든 프로젝트의 흐름

```
세션에서 요청 → Claude PR → CI(로컬 Supabase DB·RLS, 화면 테스트, 웹 스모크, 네이티브 변경 판정)
             → 📱 프리뷰(웹 링크 · OTA 또는 "새 빌드 필요") → PR 종합 코멘트(리뷰 · Risk 0–100 · merge 조건)
사람이 merge → 스테이징: DB 마이그레이션 → 스테이징 앱에 OTA(JS 변경) 또는 새 빌드(네이티브 변경)
사람이 폰으로 확인 → "출시해줘" → OTA 10→50→100% (오류율 감시·자동 중단) / 스토어 빌드 → 심사 → 단계적 출시
장애 → "되돌려줘" → OTA 롤백 / 스토어 빌드는 롤아웃 중지 + 킬스위치 + 핫픽스
```

핵심은 **JS 변경과 네이티브 변경을 기계적으로 구분**하는 것이다(fingerprint). JS 변경은 몇 분 만에 내보내고 되돌릴 수 있고,
네이티브 변경은 새 빌드·심사가 필요하며 설치된 앱을 되돌릴 수 없다 — PR·Risk·배포가 모두 이 구분을 따른다.

## 새 앱 만들기

1. 처음 한 번: [docs/bootstrap/SETUP.md](docs/bootstrap/SETUP.md) (Expo·Supabase 토큰, Claude 앱, 시크릿)
2. claude.ai/code 에서 이 리포지토리로 세션을 열고 **"단어 카드 앱 만들어줘"**
   → `new-project` 스킬이 이름·앱 식별자·로그인 필요 여부를 묻고 워크플로를 실행한다:
   GitHub 리포지토리 + Supabase 프로젝트(서울) + EAS 프로젝트 + 브랜치 규칙 → 첫 Android 스테이징 빌드
3. 같은 세션에서 바로 앱 개발이 이어진다. 스토어 계정은 출시할 때 — [docs/STORE-LAUNCH.md](docs/STORE-LAUNCH.md)

## 무엇이 들어 있나

- `src/` — 앱 골격(Expo Router), Supabase 클라이언트, Sentry, 앱 정보(채널·OTA 업데이트·커밋)
- `supabase/` — 마이그레이션(Supabase CLI 형식), Edge Functions, 세션용 auth shim
- `.github/workflows/` — ci · pr-review · claude-mention · deploy(스테이징) · release · rollout-monitor · rollback · preview-cleanup · new-project
- `scripts/` — `gh.mjs`(세션용 GitHub REST), `risk/`(Risk Score), `fingerprint.mjs`(네이티브 변경 판정), `release.mjs`(EAS 배포·출시·롤백), `db.mjs`(로컬 마이그레이션)
- `docs/` — [runbook](docs/runbook.md)(출시·장애), [STORE-LAUNCH](docs/STORE-LAUNCH.md)(스토어 규정·첫 출시), [recipes](docs/recipes/)(커뮤니티 신고·차단, 결제·광고, 게임, 위치, 오프라인), [bootstrap](docs/bootstrap/)(설계·스택·설정·유지보수)

## 로컬 확인

```bash
npm ci
npm run check     # lint · typecheck · vitest(+ TEST_DATABASE_URL 이 있으면 DB/RLS) · jest · 웹 export · Playwright
```

설계 근거는 [docs/bootstrap/DESIGN.md](docs/bootstrap/DESIGN.md), 스택 비교는 [docs/bootstrap/STACK.md](docs/bootstrap/STACK.md).
