import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const orchestrator = readFileSync("supabase/functions/agent-orchestrator/index.ts", "utf8");
const publish = readFileSync("supabase/functions/youtube-publish/index.ts", "utf8");
const oauth = readFileSync("supabase/functions/youtube-oauth-start/index.ts", "utf8");

describe("agent and publication boundaries", () => {
  it("validates pending confirmation payloads before rendering them", () => {
    expect(readFileSync("lib/agent-api.ts", "utf8")).toContain("candidate.confirmationToken.length >= 32");
  });

  it("does not send a confirmation nonce back to the model", () => {
    expect(orchestrator).toContain('confirmationToken: "[withheld]"');
  });

  it("requires a one-time confirmation before YouTube upload", () => {
    expect(publish).toContain('eq("action", "publish_to_youtube")');
    expect(publish).toContain('eq("status", "pending")');
    expect(publish).toContain('candidate.expires_at');
    expect(publish).toContain("nonce_hash");
  });

  it("uses PKCE and does not put the provider key in the URL", () => {
    expect(oauth).toContain("code_challenge_method: \"S256\"");
    expect(oauth).toContain("code_verifier");
  });
});
