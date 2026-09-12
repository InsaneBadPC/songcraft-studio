import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL || "https://hfykngbhcxmnpxvjagoj.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);
const userId = "99dacb87-b331-4069-9b15-61c06bd76bdd";
const { data, error } = await supabase.auth.admin.updateUserById(userId, { password: "Heslo0711" });
console.log("update error", error);
console.log("update data", data?.user?.id);
// try login
const supa2 = createClient(url, "sb_publishable_5mOBkLJhXzLb6U6_stJLQQ_j89L0lEH");
const { data: login, error: loginErr } = await supa2.auth.signInWithPassword({ email: "temney@songcraft.test", password: "Heslo0711" });
console.log("loginErr", loginErr?.message ?? "none");
console.log("login user", login?.user?.id ?? "none");
