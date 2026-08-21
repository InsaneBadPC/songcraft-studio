import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

/** Připravené externí přihlášení pro Android i web. */
export function useSupabaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: authError } = await supabase.auth.getUser();
    setUser(data.user ?? null);
    setError(authError ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const logout = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setUser(null);
  }, []);

  return { user, loading, error, isAuthenticated: useMemo(() => Boolean(user), [user]), refresh, logout };
}
