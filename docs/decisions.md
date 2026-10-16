# 결정 기록

이 프로젝트에서 내린 기술·인프라·스토어 결정을 남긴다. Claude 와 세션에서 합의한 것도 여기에 적는다.
최신 항목이 위로 온다.

형식:

```
## YYYY-MM-DD 제목
- 결정:
- 이유:
- 검토한 대안:
- 비용:
- 영향: (새 환경변수, 네이티브 변경 여부, 스토어 개인정보 라벨, 되돌리는 법)
```

## 미결

첫 기능을 만들기 전에 정한다.

- **로그인이 필요한가** — 필요 없으면(오프라인 학습 앱·싱글 게임) 로그인·계정 삭제 화면을 뺀다.
  필요하면 방식: 이메일 OTP / Apple / Google (Apple 4.8: 소셜 로그인을 넣으면 Apple 로그인도).
- **수익화** — 없음 / 인앱결제·구독(RevenueCat) / 광고(AdMob). `docs/recipes/monetization.md`.
- **스토어 계정 형태** — Google Play 개인 계정(첫 출시 전 12명·14일 비공개 테스트 필요) / 조직 계정(D-U-N-S 필요).
- **최소 지원 OS** — 기본값(Expo SDK 57 기준)을 쓸지, 더 높일지.

## 외부 연동

Risk Score 의 Compatibility 판단에 쓰인다. 이 앱의 DB·RPC·Edge Function 을 쓰는 consumer 를 적는다.

- **출시된 앱 버전들** — 스토어에 나간 각 빌드(그리고 그 위의 OTA 업데이트)는 사용자가 업데이트할 때까지 계속
  Supabase 를 호출한다. 현재 최소 지원 버전: (출시 후 기록)
- (그 밖에 없음)

---

## {{CREATED_AT}} 기본 스택 (mobile-bootstrap)

- 결정: Expo(React Native) + Expo Router + TypeScript, EAS Build/Submit/Update(클라우드 빌드·스토어 제출·OTA),
  Supabase(Postgres + RLS, Auth, Storage, Realtime, Edge Functions), Sentry(오류), GitHub Actions(CI/CD) +
  Claude(리뷰·Risk Score·auto-fix)
- 이유: mobile-bootstrap 의 고정 스택. Mac 없이 Linux(클라우드 세션·GitHub Actions)만으로 iOS 까지 빌드·제출·OTA 가
  되는 유일한 1st-party 경로. 근거와 대안 비교는 템플릿의 `docs/bootstrap/STACK.md`.
- 비용(2026-10 조사 기준 — 요금표에서 재확인): Expo 무료(월 Android 15 + iOS 15 빌드, OTA 월 1,000 MAU) → 필요 시 Starter $19/월.
  Supabase 무료(2 프로젝트, 7일 미사용 시 일시정지) → 출시 앱은 Pro $25/월 권장.
  Apple Developer $99/년, Google Play $25(1회). Sentry 무료로 시작. Claude(API 사용량).
- 영향: merge = 스테이징(내부 테스트) 배포, 출시는 release 워크플로. DB 는 스테이징·프로덕션이 공유.
- 되돌리는 법: OTA = rollback 워크플로, 스토어 빌드 = 롤아웃 중단 + 핫픽스(`docs/runbook.md`).
