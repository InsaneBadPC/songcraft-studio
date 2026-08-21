import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

export type SongCraftUser = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: "supabase";
  lastSignedIn: Date;
};

export function useAuth() {
  const [user, setUser] = useState<SongCraftUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mapUser = useCallback((source: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null): SongCraftUser | null => source ? {
    id: source.id,
    openId: source.id,
    name: typeof source.user_metadata?.display_name === "string" ? source.user_metadata.display_name : "Temney",
    email: source.email ?? null,
    loginMethod: "supabase",
    lastSignedIn: new Date(),
  } : null, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: authError } = await supabase.auth.getUser();
    setUser(mapUser(data.user));
    setError(authError ?? null);
    setLoading(false);
  }, [mapUser]);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [mapUser, refresh]);

  const logout = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setUser(null);
    setError(null);
  }, []);

  return { user, loading, error, isAuthenticated: useMemo(() => Boolean(user), [user]), refresh, logout };
}

