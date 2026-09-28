import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("workers/video-renderer/worker.mjs", "utf8");

describe("Oracle video worker contract", () => {
  it("reads the persisted prompt_used column and all three modes", () => {
    expect(worker).toContain("prompt_used");
    expect(worker).not.toContain("select=id,user_id,song_id,type,mode,backend,prompt,");
    expect(worker).toContain("static_cover");
    expect(worker).toContain("image_animation");
    expect(worker).toContain("full_scenes");
  });

  it("uses final/tagged audio and private owner paths", () => {
    expect(worker).toContain("is_final=eq.true");
    expect(worker).toContain("tagged_storage_path || version.original_storage_path || version.storage_path");
    expect(worker).toContain("ownedPath(job.user_id");
  });

  it("renders the uploaded-video loop locally and never trusts a foreign path", () => {
    expect(worker).toContain("video_loop");
    expect(worker).toContain("renderSeamlessVideoLoop");
    // vlastnictví cesty se musí ověřit přes ownedPath, ne ručně
    expect(worker).toContain('ownedPath(job.user_id, job.source_video_path)');
    // plynulost: crossfade jednotka + opakování na délku audia
    expect(worker).toContain("xfade=transition=fade");
    expect(worker).toContain("-stream_loop");
    // 9:16 pro short, 16:9 jinak
    expect(worker).toContain('aspect === "9:16" ? { w: 1080, h: 1920 }');
  });

  it("has a fail-closed duration probe instead of guessing", () => {
    expect(worker).toContain("ffprobe");
    expect(worker).toContain("ffprobe returned no usable duration");
  });

  it("makes the stored aspect match the real output", () => {
    // dashboard vrací 16:9; pro 9:16 se musí výstup převést, jinak short v DB
    // tvrdí svislé a soubor je vodorovný
    expect(worker).toContain("fitToAspect");
    expect(worker).toContain("pad=1080:1920");
  });

  it("only knows render types the DB constraint allows", () => {
    const known = ['"static_cover"', '"image_animation"', '"full_scenes"', '"video_loop"'];
    for (const type of known) expect(worker).toContain(`type === ${type}`);
    expect(worker).toContain("Unknown video type");
  });
});
