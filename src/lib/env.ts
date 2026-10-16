// 앱이 읽는 환경변수는 여기로 모은다.
//
// 앱 번들에 들어가는 값은 EXPO_PUBLIC_* 뿐이고, 빌드할 때 문자열로 박힌다 — 누구나 꺼내 볼 수 있다.
// 그래서 여기에는 공개돼도 되는 값(Supabase URL·publishable key, Sentry DSN)만 둔다.
// service_role 키, API 비밀키 같은 것은 절대 EXPO_PUBLIC_ 로 만들지 않는다(Edge Function 의 secret 으로).
//
// Expo 는 `process.env.EXPO_PUBLIC_X` 를 글자 그대로 쓴 곳만 치환하므로, 동적 접근(process.env[name])
// 대신 아래 표에서 한 번씩 정적으로 읽는다. 새 변수를 추가하면 ENV_DOCS 와 PUBLIC_ENV 에 한 줄씩 넣고
// PR 본문 "배포 영향" 에 적는다. 값은 EAS 환경변수(production/preview/development)에 사용자가 넣는다.
export const ENV_DOCS = {
  EXPO_PUBLIC_SUPABASE_URL: "Supabase 프로젝트 URL (Supabase → Project Settings → API, new-project 가 EAS 에 설정)",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "Supabase publishable(anon) 키 — 공개 키다 (Supabase → Project Settings → API Keys)",
  EXPO_PUBLIC_SENTRY_DSN: "Sentry 프로젝트 DSN (Sentry → Settings → Client Keys). 없으면 오류 수집을 끈다",
  EXPO_PUBLIC_COMMIT_SHA: "빌드/업데이트한 커밋 (CI 가 넣는다). 앱 정보 화면과 Sentry release 에 쓴다",
} as const;

export type EnvName = keyof typeof ENV_DOCS;
type Env = Partial<Record<EnvName, string | undefined>>;

export const PUBLIC_ENV: Env = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_COMMIT_SHA: process.env.EXPO_PUBLIC_COMMIT_SHA,
};

export function optionalEnv(name: EnvName, env: Env = PUBLIC_ENV): string | undefined {
  const value = env[name];
  return value ? value : undefined;
}

export function requireEnv(name: EnvName, env: Env = PUBLIC_ENV): string {
  const value = optionalEnv(name, env);
  if (!value) throw new Error(`환경변수 ${name} 가 설정되지 않았습니다 — ${ENV_DOCS[name]}`);
  return value;
}
