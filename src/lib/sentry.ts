// Sentry 설정값. DSN 이 없으면(로컬·프리뷰 초기) 아예 끈다.
// 개인정보는 보내지 않는다(sendDefaultPii: false). 사용자 식별이 필요하면 내부 id 만 setUser({ id }).
// release/dist 는 SDK 기본값(앱 버전+빌드 번호)을 쓴다 — 소스맵 업로드와 맞물려 있으므로 덮어쓰지 않는다.
// 커밋과 OTA 업데이트 id 는 태그로 붙인다(src/app/_layout.tsx).
export type SentryOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
};

export function sentryOptions(
  dsn: string | undefined,
  info: { channel: string | null | undefined },
): SentryOptions {
  return {
    dsn,
    enabled: Boolean(dsn),
    // EAS Update 채널(production / staging / pr-N)을 그대로 환경 이름으로 쓴다. 개발 빌드는 development.
    environment: info.channel || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  };
}
