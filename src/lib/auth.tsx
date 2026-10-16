import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { log } from "@/lib/log";
import { supabase } from "@/lib/supabase";

// 로그인 상태와 로그인·로그아웃·계정 삭제. 화면은 useSession() 으로 상태를 읽는다.
// 로그인 수단: 이메일 OTP(항상) · Apple · Google(app_config 의 features.login_* 로 켬 — Supabase 대시보드에서 공급자를 설정한 뒤).
// Apple 4.8: Google 을 켜면 Apple 도 켠다(화면이 강제한다).

type AuthState = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: Boolean(supabase) });
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useSession = () => useContext(AuthContext);

function client() {
  if (!supabase) throw new Error("백엔드가 설정되지 않았습니다");
  return supabase;
}

/** 사용자에게 보여 줄 오류 문구. 내부 메시지를 그대로 노출하지 않는다. */
export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/rate limit|too many/i.test(message)) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(message)) return "코드가 맞지 않거나 만료되었습니다.";
  if (/network|fetch/i.test(message)) return "네트워크 연결을 확인해 주세요.";
  if (/canceled|cancelled|ERR_REQUEST_CANCELED/i.test(message)) return "";
  return "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export async function sendEmailCode(email: string) {
  const { error } = await client().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await client().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
  if (error) throw error;
}

/** iOS 는 시스템 Apple 로그인 창(ID 토큰 + nonce), 그 밖에는 브라우저 OAuth. */
export async function signInWithApple() {
  if (Platform.OS !== "ios") return signInWithOAuth("apple");
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) throw new Error("Apple ID 토큰을 받지 못했습니다");
  const { error } = await client().auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
}

export async function signInWithOAuth(provider: "google" | "apple") {
  const auth = client().auth;
  if (Platform.OS === "web") {
    const { error } = await auth.signInWithOAuth({ provider });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL("auth/callback");
  const { data, error } = await auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw error ?? new Error("로그인 주소를 받지 못했습니다");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new Error("canceled");
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("로그인 코드를 받지 못했습니다");
  const exchanged = await auth.exchangeCodeForSession(code);
  if (exchanged.error) throw exchanged.error;
}

export async function signOut() {
  await client().auth.signOut();
}

/**
 * 계정 삭제(Apple 5.1.1(v), Google Play). Edge Function 이 사용자와 그 데이터를 지운다.
 * Apple 로 가입한 계정은 Apple 토큰도 폐기해야 해서, iOS 에서는 Apple 로그인 창을 한 번 더 띄워 authorization code 를 받는다.
 */
export async function deleteAccount(session: Session) {
  let appleAuthorizationCode: string | null = null;
  const usesApple = session.user.identities?.some((i) => i.provider === "apple");
  if (usesApple && Platform.OS === "ios") {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    appleAuthorizationCode = credential.authorizationCode;
  }
  const { error } = await client().functions.invoke("delete-account", { body: { apple_authorization_code: appleAuthorizationCode } });
  if (error) {
    log.error("계정 삭제 실패", { error });
    throw error;
  }
  await client().auth.signOut();
}
