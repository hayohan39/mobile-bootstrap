# 운영 런북

출시·장애·롤백·데이터 복구 때 이 순서대로 한다. 원칙: **먼저 복구, 원인은 나중.**
Claude 세션에서 "출시해줘", "앱이 죽어", "되돌려줘" 라고 하면 Claude 도 이 문서를 따른다.

## 한눈에: 코드가 사용자 폰까지 가는 길

```
PR merge ──► 스테이징 (deploy.yml, 자동)          ──► 사람이 폰으로 확인 ──► 출시 (release.yml, 요청 시)
             · DB 마이그레이션 = 프로덕션에 바로 적용                         · kind=ota   : production OTA 10% → 50 → 100%
             · JS 변경 → 스테이징 앱에 OTA                                    · kind=store : 프로덕션 빌드 → 스토어 심사 → 단계적 출시
             · 네이티브 변경 → 스테이징 빌드 새로(설치 필요)
```

| 무엇이 바뀌었나 | 스테이징 | 출시 | 되돌리기 |
| --- | --- | --- | --- |
| JS 만 (fingerprint 같음) | OTA, 몇 분 | `kind=ota` — 심사 없음, 단계적 | `rollback.yml` — 몇 분 |
| 네이티브 (fingerprint 바뀜) | 새 빌드(Android APK / iOS TestFlight) | `kind=store` — 심사 1~3일, 단계적 | **불가** — 롤아웃 중단 + 킬스위치 + 핫픽스 |
| DB (마이그레이션) | merge 순간 프로덕션에 적용 | — | 새 마이그레이션 / 백업·PITR |

## 처음 한 번 (프로젝트를 만든 직후)

- [ ] **Sentry**: Sentry 에서 React Native 프로젝트를 만든다.
  - EAS 환경변수(production·preview)에 `EXPO_PUBLIC_SENTRY_DSN` — 오류 수집 (다음 빌드·OTA 부터)
  - GitHub 시크릿 `SENTRY_AUTH_TOKEN`, 변수 `SENTRY_ORG`·`SENTRY_PROJECT` — 소스맵 업로드와 **롤아웃 감시**(없으면 롤아웃이 자동으로 오르지 않는다)
- [ ] **Supabase 플랜**: 무료 플랜은 7일 동안 요청이 없으면 일시정지되고, 백업·PITR 이 없다. 실제 사용자가 생기면
  Pro 로 올리고 PITR 애드온을 검토한다(데이터 복구 가능 범위가 여기서 정해진다).
- [ ] **Supabase Auth**: Authentication → URL Configuration 의 Site URL·Redirect URL 에 앱 scheme(`<scheme>://`)과
  웹 주소를 넣는다. 이메일 발송 한도가 낮으므로 출시 전에 SMTP(예: Resend)를 연결한다.
- [ ] **스토어 계정과 첫 출시**: `docs/STORE-LAUNCH.md` 를 처음부터 따른다(계정 가입, Play 비공개 테스트 14일 등).
- [ ] **GitHub**: Settings → Rules 에 `main protection`(PR 필수, 필수 체크 `test` · `risk-gate`)이 있는지.

## 출시 ("출시해줘")

1. `node scripts/gh.mjs deploys` — 마지막 스테이징 배포가 성공했는지, 그 뒤에 merge 된 것이 없는지.
2. 사용자에게 확인: **스테이징 앱에서 무엇을 확인했는지.** 확인 전이면 출시하지 않는다.
3. 네이티브 변경이 스테이징에 있었는지(📦 OTA 만이었나 🧱 빌드가 있었나):
   - **OTA 만** → `node scripts/gh.mjs dispatch release.yml kind=ota rollout=10`
     - 프로덕션 빌드와 runtimeVersion 이 다르면 워크플로가 실패하며 `kind=store` 를 안내한다.
     - 이후 `rollout-monitor.yml` 이 매일 오류율을 보고 50% → 100% 로 올린다. Sentry 가 없으면 사람이
       "롤아웃 100% 로 올려줘" → `dispatch release.yml kind=rollout percent=100`.
     - 감시는 진행 중인 롤아웃이 없으면 스스로 꺼지고(Actions 시간 절약) 이 release 실행이 다시 켠다. EAS 콘솔에서
       직접 롤아웃을 시작했다면 Actions → Rollout monitor → Enable workflow 로 켠다.
   - **네이티브 변경** → 버전 올리기 PR(`app.json` 의 `version`, 예: 1.2.0 → 1.3.0)을 먼저 merge 해서 스테이징에서 확인한 뒤
     `node scripts/gh.mjs dispatch release.yml kind=store`
     - Android: Play 프로덕션 트랙에 10% 단계적 출시로 제출. 비율은 Play Console → 프로덕션 → 출시 관리.
     - iOS: App Store Connect 에 업로드까지. **사용자가** App Store Connect → 앱 → 새 버전 → 빌드 선택 →
       "단계적 출시" 켜기 → "심사에 제출". 심사는 보통 1~2일.
4. 두세 줄로 보고: 무엇이, 어느 플랫폼에, 몇 %, 다음 단계.

## 장애 대응

1. **확인** — Sentry 새 오류(어느 release·update_id), 앱 정보 화면의 채널·업데이트, 언제부터인지, 최근 출시 직후인지.
2. **OTA 로 나간 JS 문제** → `node scripts/gh.mjs dispatch rollback.yml reason="로그인 화면 크래시"`.
   롤아웃 중이면 롤아웃을 취소하고, 아니면 직전 업데이트(없으면 앱에 포함된 번들)로 되돌린다. 사용자는 앱을 다시 열 때 받는다.
3. **스토어 빌드(네이티브) 문제** — 설치된 바이너리는 되돌릴 수 없다. 순서대로:
   1. 확산 막기 — Play Console → 프로덕션 → **출시 중지(Halt rollout)**, App Store Connect → **단계적 출시 일시정지**. (사용자만 할 수 있다)
   2. 기능 끄기 — 문제 기능에 **원격 킬스위치**가 있으면 끈다(`app_config` 테이블, `docs/recipes/` 참고).
   3. JS 로 고칠 수 있으면 → 수정 PR → 스테이징 → `kind=ota` 로 같은 바이너리에 핫픽스.
   4. 네이티브라면 → 수정 PR → `kind=store` → 심사(긴급이면 App Store Connect 에서 "신속 심사 요청").
   5. 구버전이 계속 위험하면 **최소 지원 버전**을 올려 강제 업데이트 화면을 띄운다.
4. **정상화 확인** — Sentry 오류가 멈췄는지, crash-free 비율.
5. **원인을 고치는 PR** — 롤백한 상태에서 다른 PR 을 merge·출시하면 문제의 코드가 다시 나간다. 고치는 PR 을 먼저.
6. 사후 기록 — 그 PR 의 Risk 등급이 얼마였는지(`node scripts/gh.mjs risk-history`). 낮게 평가됐다면 rubric·config 보정 PR.

> OTA 롤백·스토어 출시 중지는 **DB 를 되돌리지 않는다.** expand → contract 를 지켰다면 이전 앱은 새 스키마에서 그대로 돈다.

## 스테이징 배포가 실패했을 때 (merge 된 PR 의 코멘트별)

| 코멘트 | 상태 | 할 일 |
| --- | --- | --- |
| ❌ DB 실패 | 마이그레이션 실패 → 앱 배포 안 함. 실패한 파일은 트랜잭션이라 되돌려졌다 | 로그 확인 → 고치는 PR(새 마이그레이션). 이미 적용된 앞 파일은 `supabase migration list` |
| ❌ 앱 실패 | DB 는 적용됨. 스테이징 앱은 이전 상태 | EAS 로그(빌드 오류·자격증명·무료 한도) → 고치는 PR 또는 Actions → Deploy → Re-run |
| 🧱 새 빌드 | 정상. 빌드가 끝나면 설치해야 확인 가능 | EAS 링크에서 APK 설치 / TestFlight 앱에서 업데이트 |
| ⏭️ 건너뜀 | 설정 없음(시크릿·projectId) | `docs/bootstrap/SETUP.md` |

EAS 무료 플랜은 빌드가 월 플랫폼당 15회, 큐 대기가 길 수 있다. 한도를 넘으면 다음 달 1일까지 빌드가 멈춘다 —
네이티브 변경을 모아서 내고, 급하면 Starter 플랜으로 올린다.

## 데이터 복구 (사람이 결정한다)

데이터를 잃거나 잘못 바꾼 경우. 복구 방법마다 잃는 것이 다르므로 Claude 는 절차와 영향을 설명하고 결정을 받는다.

1. **되돌리는 마이그레이션 (먼저 고려)** — 잘못 바뀐 행을 알 수 있으면 고치는 SQL 을 새 마이그레이션으로.
2. **백업에서 부분 복구** (Pro 플랜) — Supabase → Database → Backups 의 일일 백업을 새 프로젝트로 복원해
   필요한 행만 읽어 와서 되돌리는 SQL 을 만든다. 그 이후 데이터를 잃지 않는다.
3. **PITR 전체 되돌리기** (PITR 애드온) — 시각을 지정해 프로젝트 전체를 되돌린다. **그 이후 쓰인 데이터가 모두 사라진다.**
4. 무료 플랜이면 2·3 이 없다. 그래서 파괴적 마이그레이션(DROP·데이터 변환)은 Risk 가 높고 PR 본문 "롤백 계획" 이 필수다.

## 비밀값이 새었을 때

1. 발급처에서 **즉시 폐기·재발급** (git 히스토리에서 지우는 것보다 먼저 — 이미 복제됐다고 가정한다).
   - Supabase service_role / secret 키 → Supabase → Project Settings → API Keys 에서 교체
   - EXPO_TOKEN → expo.dev → Access tokens. 서명 키는 EAS 가 보관하므로 새지 않는다(로컬에 받은 적이 없다면).
2. 새 값을 GitHub 시크릿 / Supabase secrets / EAS 환경변수에 넣고 필요하면 다시 배포.
3. **앱 번들에 들어간 값(EXPO_PUBLIC_*)이 비밀이었다면** 이미 설치된 앱에서 꺼낼 수 있다 — 키를 교체하고 그 키를 쓰던
   기능을 Edge Function 뒤로 옮기는 PR 을 낸다.
4. 접근 로그에서 악용 흔적 확인. 필요하면 사용자 고지(개인정보 유출이면 법정 신고 기한이 있다).

## 서명 키를 잃었을 때

EAS 가 보관하므로 보통 잃지 않는다. 계정 사고로 Android 업로드 키를 잃으면 Play Console → 앱 무결성 → 업로드 키 재설정을
요청한다(Play 앱 서명을 쓰는 경우에만 가능 — 기본값). iOS 인증서·프로비저닝은 EAS 가 다시 만들 수 있다.

## 정기 점검 (월 1회)

- `node scripts/gh.mjs risk-history` — 등급과 실제 결과(스테이징 실패, 출시 후 롤백)가 맞는지(점수 보정).
- 의존성: 리포의 보안 알림(Security → Dependabot alerts)을 보고 필요한 것을 세션에서 올린다("supabase-js 보안 업데이트 해줘").
  Dependabot 버전 업데이트 PR 은 쓰지 않는다(쉬는 달에도 Actions 시간을 쓴다). Expo SDK 는 1년에 2~3번 나온다 — SDK 업그레이드는 별도 PR·스토어 출시.
- 스토어 요구사항: Google Play target API 마감(매년 8월 말), Apple 의 새 Xcode·SDK 요구(매년 봄), 연령 등급 설문.
- 최소 지원 버전을 올릴 수 있는지(오래된 버전의 사용자 비율) — 올리면 contract 마이그레이션을 할 수 있다.
- Expo(빌드·OTA MAU) · Supabase · Sentry · Claude 사용량과 비용, Apple 개발자 멤버십 갱신일.
