import { describe, expect, it } from "vitest";

import { youtubeFfmpegArgs } from "../lib/youtube-video-args";

describe("YouTube video export", () => {
  it("vytváří Full HD MP4 se statickým coverem a AAC zvukem", () => {
    const args = youtubeFfmpegArgs("cover.jpg", "song.mp3", "output.mp4");
    expect(args).toContain("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p");
    expect(args).toEqual(expect.arrayContaining(["-loop", "1", "-c:a", "aac", "-b:a", "192k", "-shortest", "output.mp4"]));
  });
});
