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
});
