# 로그인 수단 켜기 (이메일 코드 · Apple · Google)

템플릿에는 로그인·로그아웃·계정 삭제가 들어 있다(`src/lib/auth.tsx`, `src/app/sign-in.tsx`, `src/app/settings.tsx`,
Edge Function `delete-account`). 기본으로 켜진 것은 **이메일 6자리 코드**(비밀번호 없음)뿐이다.
Apple·Google 은 공급자 설정(사용자만 할 수 있음)을 마친 뒤 `app_config` 로 켠다 — 코드 배포 없이.

로그인이 필요 없는 앱이면: `sign-in`·`settings` 화면과 홈의 계정 링크를 지우고, `profiles`·`push_tokens` 는 쓰지 않는다
(마이그레이션은 이미 적용됐으니 그대로 둔다). decisions.md 에 기록.

## 이메일 코드

- Supabase 기본 메일 발송은 시간당 몇 통으로 제한된다. **출시 전에 SMTP 를 연결**한다(Resend·SES 등 — 비용·도메인 필요, 먼저 묻는다):
  Supabase → Authentication → Emails → SMTP Settings.
- 메일 본문이 6자리 코드를 보이게: Authentication → Email Templates → Magic Link 에 `{{ .Token }}` 을 넣는다
  (기본 템플릿은 링크만 있다). 제목·본문은 한국어로.
- 심사용 데모 계정: 심사자는 메일을 못 받는다 — 테스트 이메일로 코드 없이 들어가는 방법을 준비한다(예: 심사 기간에만
  Authentication 에 비밀번호 로그인 계정을 만들어 App Review 정보에 적고, 앱에 비밀번호 로그인을 숨겨 두지 않는다 —
  Claude 에게 "심사용 로그인 준비해줘").

## Apple (iOS 는 필수 조건이 될 수 있다 — Apple 4.8)

소셜 로그인(Google 등)을 하나라도 켜면 iOS 에는 Apple 로그인도 있어야 한다. 화면이 이를 강제한다(iOS 에서 Google 은 Apple 이 켜져 있을 때만 보임).

☐ 사용자
1. Apple Developer → Certificates, IDs & Profiles → Identifiers → 앱의 App ID 에 **Sign in with Apple** 체크
   (EAS 빌드가 capability 를 동기화하지만, 키 발급을 위해 확인).
2. Keys → + → Sign in with Apple 키 생성 → `.p8` 내려받기, Key ID 기록.
3. Supabase → Authentication → Sign In / Providers → Apple: Client IDs 에 **bundle id**(iOS 네이티브용)와,
   Android·웹에서도 쓰려면 Services ID 를 넣고 Secret Key(JWT)를 설정(Supabase 화면의 안내를 따른다).
4. 계정 삭제 때 Apple 토큰 폐기용 Supabase Edge Function secret: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`(.p8 내용), `APPLE_CLIENT_ID`(bundle id)
   — Supabase → Edge Functions → Secrets. 없으면 삭제는 되지만 폐기는 건너뛴다(로그에 경고).
5. Supabase SQL: `update public.app_config set value = value || '{"login_apple": true}' where key = 'features';`

## Google

☐ 사용자
1. Google Cloud Console → OAuth 동의 화면(앱 이름·지원 이메일·개인정보처리방침 URL) → 사용자 인증 정보 → OAuth 클라이언트 ID(**웹 애플리케이션**),
   승인된 리디렉션 URI 에 `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Providers → Google 에 Client ID / Secret.
3. Supabase → Authentication → URL Configuration 의 Redirect URLs 에 `<scheme>://**`(new-project 가 넣어 둠)와 웹 주소.
4. `update public.app_config set value = value || '{"login_google": true}' where key = 'features';` (iOS 는 Apple 도 켜야 보인다)

앱은 브라우저 창(`expo-web-browser`)으로 Google 에 로그인하고 `<scheme>://auth/callback` 으로 돌아와 code 를 교환한다(PKCE).
네이티브 Google 로그인 창(`@react-native-google-signin/google-signin`)이 필요하면 네이티브 변경 PR 로 — 먼저 묻는다.

## 카카오·네이버

Supabase 는 카카오를 기본 공급자로 지원한다(Providers → Kakao). 켜는 순서는 Google 과 같고, iOS 에서는 Apple 도 켜야 한다.
네이버는 기본 공급자가 아니다 — 커스텀 OIDC 가 필요해 범위가 커진다(먼저 묻는다).

## 테스트

- 순수 도우미: `src/lib/auth.test.ts`. 화면: 백엔드 없을 때·있을 때(`e2e/web/pages.spec.ts`).
- 실제 로그인은 스테이징 앱으로 사람이 확인한다(이메일 수신, Apple 창, Google 리디렉트).
