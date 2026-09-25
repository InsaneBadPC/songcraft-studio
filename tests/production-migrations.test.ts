import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const renderTypes = readFileSync("supabase/migrations/20260925000000_agent_video_render_types.sql", "utf8");
const confirmation = readFileSync("supabase/migrations/20260925130000_agent_confirmations.sql", "utf8");
const oauth = readFileSync("supabase/migrations/20260925150000_youtube_oauth_states.sql", "utf8");
const leases = readFileSync("supabase/migrations/20260925140000_video_worker_leases.sql", "utf8");

describe("production workflow migrations", () => {
  it("targets the render type constraint by column, not by text matching", () => {
    expect(renderTypes).toContain("a.attname = 'type'");
    expect(renderTypes).not.toContain("pg_get_constraintdef(oid) LIKE '%type%'");
    expect(renderTypes).toContain("conname = 'agent_videos_type_check'");
  });

  it("stores only hashed, expiring one-time confirmations", () => {
    expect(confirmation).toContain("nonce_hash text not null unique");
    expect(confirmation).toContain("status text not null default 'pending'");
    expect(confirmation).toContain("revoke all on public.agent_confirmations");
  });

  it("stores OAuth verifier server-side with an expiry", () => {
    expect(oauth).toContain("code_verifier text not null");
    expect(oauth).toContain("state_hash text not null unique");
    expect(oauth).toContain("revoke all on public.youtube_oauth_states");
  });

  it("defines bounded worker retries and leases", () => {
    expect(leases).toContain("attempt_count integer not null default 0");
    expect(leases).toContain("lease_expires_at timestamptz");
    expect(leases).toContain("agent_videos_attempts_check");
  });
});
