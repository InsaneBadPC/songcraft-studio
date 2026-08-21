import { describe, expect, it } from "vitest";

import { youtubeFfmpegArgs } from "../lib/youtube-video-args";

describe("YouTube video export", () => {
  it("vytváří Full HD MP4 s coverem, pohyblivou vlnou a AAC zvukem", () => {
    const args = youtubeFfmpegArgs("cover.jpg", "song.mp3", "output.mp4", "Noční, sen: I. díl", "Temney");
    expect(args).toContain("[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[cover];[1:a]aformat=channel_layouts=mono,showwaves=s=1540x180:mode=line:colors=0xD58A60:rate=30,format=rgba,colorkey=0x000000:0.01:0.0[wave];[cover][wave]overlay=(W-w)/2:H-h-86:shortest=1[visual];[visual]drawtext=fontfile=/system/fonts/Roboto-Regular.ttf:text='Noční\\, sen\\: I. díl':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=74:shadowcolor=black@0.80:shadowx=3:shadowy=3:expansion=none[headline];[headline]drawtext=fontfile=/system/fonts/Roboto-Regular.ttf:text='Temney':fontcolor=0xD58A60:fontsize=30:x=(w-text_w)/2:y=154:shadowcolor=black@0.72:shadowx=2:shadowy=2:expansion=none,format=yuv420p[video]");
    expect(args).toEqual(expect.arrayContaining(["-loop", "1", "-filter_complex", "-map", "[video]", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest", "output.mp4"]));
  });
});
