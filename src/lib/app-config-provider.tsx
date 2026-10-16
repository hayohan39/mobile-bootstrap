import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { type AppConfig, DEFAULT_CONFIG, parseConfig } from "@/lib/app-config";
import { log } from "@/lib/log";
import { supabase } from "@/lib/supabase";

// 앱 시작 때 원격 설정을 한 번 읽는다. 실패·지연(5초)되면 기본값으로 연다 — 설정 서버 장애가 앱 장애가 되지 않게.
const TIMEOUT_MS = 5000;
const AppConfigContext = createContext<AppConfig>(DEFAULT_CONFIG);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    Promise.race([supabase.from("app_config").select("key, value"), timeout])
      .then((result) => {
        if (!active || !result) return;
        if (result.error) throw result.error;
        setConfig(parseConfig(result.data));
      })
      .catch((error) => log.warn("원격 설정을 읽지 못함", { error }));
    return () => {
      active = false;
    };
  }, []);
  return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}

export const useAppConfig = () => useContext(AppConfigContext);
