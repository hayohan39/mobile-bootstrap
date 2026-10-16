# 푸시 알림

템플릿: 설정 화면의 "알림 켜기" → 권한 요청(그때만) → Expo 푸시 토큰을 `push_tokens` 에 저장(`src/lib/push.ts`).
보내는 쪽과 플랫폼 키는 앱마다 설정한다.

## 플랫폼 키 (사용자, 한 번)

- **iOS**: Apple 계정이 있으면 EAS 가 APNs 키를 만들어 준다 — 첫 iOS 빌드 때 자격증명 화면에서 "Push Notifications" 키 생성에 동의.
- **Android**: FCM 이 필요하다.
  1. Firebase 콘솔에서 프로젝트 생성 → Android 앱 추가(패키지 = `app.json` 의 `android.package`) → `google-services.json` 받기.
  2. 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON) → expo.dev → Credentials → Android → **FCM V1 service account key** 에 업로드.
  3. `google-services.json` 은 리포지토리에 넣지 않는다(.gitignore). EAS 파일 환경변수로 올리고
     (`eas env:create --name GOOGLE_SERVICES_JSON --type file --visibility secret`), 🤖 Claude 가 `app.config.ts` 를 추가해
     `android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON` 로 연결하는 PR 을 만든다(네이티브 변경).
  FCM 설정 전에는 Android 에서 "알림을 켜지 못했습니다" 가 나온다(정상).

## 보내기

서버에서 보낸다(앱끼리 직접 보내지 않는다). Edge Function 예:

```ts
// supabase/functions/notify/index.ts — 트리거(새 댓글 등)나 관리 도구에서 service_role 로 호출
const tokens = await admin.from("push_tokens").select("token").eq("user_id", targetUserId);
await fetch("https://exp.host/--/api/v2/push/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}) },
  body: JSON.stringify(tokens.data.map((t) => ({ to: t.token, title, body, data: { url: "/posts/123" } }))),
});
```

- Expo Push 응답의 `DeviceNotRegistered` 오류가 온 토큰은 `push_tokens` 에서 지운다.
- 알림 본문에 개인정보·메시지 전문을 넣지 않는다(잠금 화면에 보인다).
- `data.url` 로 화면을 연다 — 화면 경로를 바꾸면 이미 보낸 알림의 링크가 깨진다(Risk `compat.route-removed`).
- 마케팅 알림은 한국 정보통신망법상 **별도 수신 동의**(그리고 야간 21~08시 별도 동의)가 필요하다 — 서비스 알림과 분리한다.
