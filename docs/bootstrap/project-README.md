# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

[mobile-bootstrap](https://github.com/hayohan39/mobile-bootstrap) 으로 만든 Android·iOS 앱 (Expo + Supabase).

## 개발 흐름

1. **Claude 세션**(claude.ai/code, 웹·모바일)에서 이 리포지토리를 골라 만들고 싶은 것을 요청
2. Claude 가 브랜치 → 구현 → 커밋 → **PR** 생성
3. CI(실패하면 Claude 가 최대 3회 자동 수정) → **📱 프리뷰**: 웹 링크 + ⚡ OTA 가능 / 🧱 새 빌드 필요
4. PR 에 **종합 코멘트** 하나: CI · AI 코드 리뷰 · **Risk Score(0–100)** · merge 조건
5. **내가 판단해서 merge** (또는 `@claude <지시>` 로 수정 요청) → **스테이징**: DB 마이그레이션 + 스테이징 앱에 OTA 또는 새 빌드
6. 폰의 스테이징 앱에서 확인 → 세션에서 **"출시해줘"** → OTA 10%→50→100% 단계적 롤아웃 / 스토어 제출

| Risk | merge 전에 필요한 것 |
| --- | --- |
| 🟢 LOW · 🟡 MEDIUM | — |
| 🟠 HIGH (네이티브 변경 포함) | PR 본문 "롤백 계획" |
| 🔴 VERY HIGH | + "배포 후 확인" |
| ⛔ CRITICAL | + 내가 `risk-accepted` 라벨 (그 커밋에 대해) |

기준: [.github/risk/rubric.md](.github/risk/rubric.md). 진행 상황은 Claude 세션에서 "지금 상황 알려줘".

## 폰에서 확인하기

- **Android**: merge 코멘트의 EAS 링크에서 스테이징 APK 설치(첫 빌드·네이티브 변경 때). JS 변경은 앱을 다시 열면 받는다.
- **iPhone**: Apple 개발자 계정 연결 후 TestFlight. 그 전에는 PR 의 웹 프리뷰.
- 앱 홈의 **앱 정보**(채널·업데이트·커밋)로 무엇이 깔렸는지 확인한다.

## 출시·장애

- 첫 스토어 출시: [docs/STORE-LAUNCH.md](docs/STORE-LAUNCH.md)
- 출시·롤백·장애: [docs/runbook.md](docs/runbook.md) — JS 문제는 Actions → **Rollback**, 스토어 빌드 문제는 롤아웃 중지 + 킬스위치

## 로컬 개발 (선택)

```bash
npm ci
npm run web                  # 브라우저에서 앱
npx expo start               # Expo Go / 개발 빌드로 폰에서 (같은 네트워크)
npm run check                # lint + typecheck + test + 웹 export + 웹 스모크
```

## 참고

- 결정 기록: [docs/decisions.md](docs/decisions.md) · 기능 레시피: [docs/recipes/](docs/recipes/)
- Claude 작업 규칙: [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md)
