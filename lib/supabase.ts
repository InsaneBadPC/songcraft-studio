import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Veřejný klíč je určený pro klientské aplikace. Soukromí dat prosazují RLS
 * pravidla v externím Supabase projektu, nikoliv utajení tohoto klíče.
 */
export const SUPABASE_URL = "https://hfykngbhcxmnpxvjagoj.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5mOBkLJhXzLb6U6_stJLQQ_j89L0lEH";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

