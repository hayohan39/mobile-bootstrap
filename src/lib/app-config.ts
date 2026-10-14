// 원격 설정(app_config 테이블): 최소 지원 버전(강제 업데이트) · 기능 킬스위치 · 점검.
// 출시된 앱은 되돌릴 수 없으므로, 이 값으로 문제 있는 기능을 끄거나 오래된 버전을 막는다(docs/runbook.md).
// 읽기에 실패하면(오프라인·백엔드 미설정) 앱을 막지 않고 기본값으로 연다.

export type Platform = "ios" | "android" | "web";

export type AppConfig = {
  minVersion: Partial<Record<Platform, string>>;
  features: Record<string, boolean>;
  maintenance: { enabled: boolean; message: string | null };
};

export const DEFAULT_CONFIG: AppConfig = {
  minVersion: {},
  features: {},
  maintenance: { enabled: false, message: null },
};

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** app_config 행들 → 설정. 모양이 틀린 값은 버리고 기본값을 쓴다(잘못 넣은 설정이 앱을 죽이지 않게). */
export function parseConfig(rows: { key: string; value: unknown }[] | null | undefined): AppConfig {
  const byKey = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const min = byKey.get("min_version");
  const features = byKey.get("features");
  const maintenance = byKey.get("maintenance");
  return {
    minVersion: isObject(min)
      ? Object.fromEntries(Object.entries(min).filter((e): e is [string, string] => typeof e[1] === "string" && /^\d+(\.\d+){0,2}$/.test(e[1])))
      : {},
    features: isObject(features)
      ? Object.fromEntries(Object.entries(features).filter((e): e is [string, boolean] => typeof e[1] === "boolean"))
      : {},
    maintenance: isObject(maintenance)
      ? { enabled: maintenance.enabled === true, message: typeof maintenance.message === "string" ? maintenance.message : null }
      : DEFAULT_CONFIG.maintenance,
  };
}

/** "1.10.0" 과 "1.9.3" 처럼 숫자로 비교한다. 음수 a<b, 0 같음, 양수 a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function needsUpdate(config: AppConfig, platform: Platform, currentVersion: string): boolean {
  const min = config.minVersion[platform];
  return Boolean(min) && compareVersions(currentVersion, min as string) < 0;
}

/** 킬스위치: 설정에 없는 기능은 켜진 것으로 본다(fallback). 로그인 수단처럼 기본이 꺼짐이면 fallback=false. */
export function isEnabled(config: AppConfig, feature: string, fallback = true): boolean {
  return config.features[feature] ?? fallback;
}

/** 강제 업데이트 화면의 스토어 주소. iOS 는 App Store id 가 있어야 한다(출시 후 project.ts 에). */
export function storeUrl(platform: Platform, ids: { androidPackage?: string; appStoreId?: string }): string | null {
  if (platform === "android" && ids.androidPackage) return `https://play.google.com/store/apps/details?id=${ids.androidPackage}`;
  if (platform === "ios" && ids.appStoreId) return `https://apps.apple.com/app/id${ids.appStoreId}`;
  return null;
}
