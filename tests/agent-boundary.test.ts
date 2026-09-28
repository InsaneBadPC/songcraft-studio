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

  it("never references an undefined identifier in the uploaded-video branch", () => {
    // Regrese: hasSourceVideo bylo použité, ale nikdy nedefinované, takže
    // make_music_video i make_short končily ReferenceError (chyba CI TS2304).
    expect(orchestrator).toContain("const hasSourceVideo =");
    const uses = orchestrator.match(/hasSourceVideo/g) ?? [];
    const defines = orchestrator.match(/const hasSourceVideo/g) ?? [];
    expect(uses.length).toBe(defines.length + 1); // 1 definice + 1 použití
  });

  it("selects the source video column the loop branch depends on", () => {
    expect(orchestrator).toContain("source_video_path");
    expect(orchestrator).toContain("id,title,lyrics,style_prompt,cover_path,source_video_path");
  });

  it("only queues render types the worker and the DB constraint accept", () => {
    // type smí být jen to, co worker umí a co povoluje agent_videos_type_check
    // ('static_cover' | 'image_animation' | 'full_scenes' | 'video_loop')
    for (const forbidden of [
      'type: isShort ? "short"',
      '"lyric_video"',
      'mode: "living_motion"',
      'mode: "loop_video"',
      'backend: "vm_living"',
      'backend: "vm_loop"',
    ]) {
      expect(orchestrator, forbidden).not.toContain(forbidden);
    }
    expect(orchestrator).toContain('type: "video_loop"');
    expect(orchestrator).toContain('type: "image_animation"');
    expect(orchestrator).toContain('backend: "vm_image_animation"');
  });

  it("declares the tool the system prompt tells the model to use", () => {
    // Regrese: prompt volal check_video_status, ale tool neexistoval, takže si ho
    // model musel vymyslet.
    expect(orchestrator).toContain("check_video_status");
    const declared = orchestrator.match(/name: "check_video_status"/g) ?? [];
    const dispatched = orchestrator.match(/name === "check_video_status"/g) ?? [];
    expect(declared.length).toBe(1);
    expect(dispatched.length).toBe(1);
  });

  it("keeps the web deploy token out of the repository", () => {
    const deployer = readFileSync("scripts/upload-supabase-web.mjs", "utf8");
    const entry = readFileSync("scripts/upload-external-web-entry.mjs", "utf8");
    for (const [name, source] of [["upload-supabase-web", deployer], ["upload-external-web-entry", entry]] as const) {
      expect(source, name).toContain("SONGCRAFT_WEB_DEPLOY_TOKEN");
      expect(source, name).not.toMatch(/scweb-[0-9a-f]/);
      expect(source, name).toContain("if (!deployToken)");
    }
  });
});
