import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 60) : "";
const uniq = (list: string[], limit: number) => [...new Set(list.filter(Boolean).map((entry) => entry.toLowerCase()))].slice(0, limit);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Použij POST požadavek." }, 405);
  const authorization = request.headers.get("Authorization");
  const geminiKey = Deno.env.get("GOOGLE_AI_STUDIO_KEY");
  if (!authorization) return json({ error: "Chybí přihlášení." }, 401);
  if (!geminiKey) return json({ error: "Hledač rýmů není správně nakonfigurován." }, 503);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Neplatné přihlášení." }, 401);

  const input = await request.json().catch(() => null) as { word?: string } | null;
  const word = clean(input?.word);
  if (!word || word.length < 2) return json({ error: "Zadej hledané slovo." }, 400);

  const instruction = [
    "Jsi mistr českého rytmování a textařský poradce. Znalostně ovládáš českou fonetiku, morfologii, přízvuk na první slabiku a hovorovou češtinu.",
    `Uživatel hledá rýmy ke slovu ve tvaru: „${word}".`,
    "Pracuj se zvukovou podobou KONCOVKY od posledního přízvučné samohlásky (např. „smůlu“ → [ůlu]; „nocí“ → [ocí]).",
    "Vrať tři skupiny:",
    "exact — jednoslovná přesná rýma (stejná koncovka od přízvuku, např. smůlu → důlu, vůli, školu, polu, tůni…)",
    "multiword — SKUPINOVÉ rýmy: dvouslovná či delší spojení, jejichž KONEC zní stejně (např. smůlu → „u kola“, „se školou“, „do dolu“, „na hůlu“, „v tom bolu“). Buď kreativní, použij předložky, zájmena, spřežky.",
    "assonance — zvukově podobné nedokonalé rýmy (podobná samohláska nebo souhláska, např. smůlu → bulu, hulem, kultem…)",
    "Pravidla: pouze reálná čeština (i hovorová), žádná vysvětlení, žádná poznámka.",
    'Vrať POUZE JSON ve tvaru {"exact":["…"],"multiword":["…"],"assonance":["…"]} — exact a assonance max 10 položek, multiword max 12.',
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(geminiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: "user", parts: [{ text: `Rýmy ke slovu: ${word}` }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 700 },
    }),
  });
  if (!response.ok) return json({ error: "AI teď odmítla požadavek. Zkus to za chvíli." }, response.status === 429 ? 429 : 502);
  const generated = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
  let raw = generated.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === "string" ? part.text : "").join("\n").trim() ?? "";
  raw = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/g, "").trim();
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return json({ error: "AI nevrátila platný výsledek." }, 502);
  try {
    const parsed = JSON.parse(match[0]) as { exact?: unknown; multiword?: unknown; assonance?: unknown };
    const toArray = (value: unknown) => Array.isArray(value) ? value.map(clean) : [];
    return json({
      exact: uniq(toArray(parsed.exact), 10),
      multiword: uniq(toArray(parsed.multiword), 12),
      assonance: uniq(toArray(parsed.assonance), 10),
    });
  } catch {
    return json({ error: "AI nevrátila platný výsledek." }, 502);
  }
});
