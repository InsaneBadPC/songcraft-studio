function escapeDrawtext(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,").replace(/[\r\n]+/g, " ").trim();
}

export function youtubeFfmpegArgs(coverPath: string, audioPath: string, outputPath: string, songTitle: string, artist = "Temney") {
  const title = escapeDrawtext(songTitle) || "Bez názvu";
  const artistName = escapeDrawtext(artist) || "Temney";
  const filter = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[cover];[1:a]aformat=channel_layouts=mono,showwaves=s=1540x180:mode=line:colors=0xD58A60:rate=30,format=rgba,colorkey=0x000000:0.01:0.0[wave];[cover][wave]overlay=(W-w)/2:H-h-86:shortest=1[visual];[visual]drawtext=fontfile=/system/fonts/Roboto-Regular.ttf:text='${title}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=74:shadowcolor=black@0.80:shadowx=3:shadowy=3:expansion=none[headline];[headline]drawtext=fontfile=/system/fonts/Roboto-Regular.ttf:text='${artistName}':fontcolor=0xD58A60:fontsize=30:x=(w-text_w)/2:y=154:shadowcolor=black@0.72:shadowx=2:shadowy=2:expansion=none,format=yuv420p[video]`;
  return [
    "-loop", "1", "-framerate", "30", "-i", coverPath,
    "-i", audioPath,
    "-filter_complex", filter,
    "-map", "[video]", "-map", "1:a",
    "-c:v", "mpeg4", "-q:v", "3", "-r", "30",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest", "-movflags", "+faststart", "-y", outputPath,
  ];
}
