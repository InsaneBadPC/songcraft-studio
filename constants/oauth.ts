import { router } from "expo-router";

/**
 * Původní název zůstává kvůli kompatibilitě existujících tlačítek. Přihlášení
 * nyní probíhá uvnitř SongCraft Studio přes externí Supabase, nikoli Manus OAuth.
 */
export async function startOAuthLogin(): Promise<string | null> {
  router.push("/auth" as never);
  return null;
}

export const getApiBaseUrl = () => "";

// Zachováno jen pro kompatibilitu nepoužívaných pomocných modulů během migrace.
export const SESSION_TOKEN_KEY = "songcraft-supabase-session";
export const USER_INFO_KEY = "songcraft-supabase-user";
