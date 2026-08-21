import { readFile } from "node:fs/promises";

const supabaseUrl = "https://hfykngbhcxmnpxvjagoj.supabase.co";
const deployToken = "scweb-20260821-8c1e9bb4-02b9-4852-a120-298dff715f63";
const body = await readFile(new URL("../dist-web/index.html", import.meta.url));
const response = await fetch(`${supabaseUrl}/functions/v1/songcraft-web-deployer`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ deployToken, action: "upload", path: "index.html", base64: body.toString("base64"), contentType: "text/html; charset=utf-8" }),
});
if (!response.ok) throw new Error(`Aktualizace vstupu webu selhala: ${response.status} ${await response.text()}`);
console.log("Externí vstup webu byl aktualizován.");
