export function youtubeFfmpegArgs(coverPath: string, audioPath: string, outputPath: string) {
  return [
    "-loop", "1", "-framerate", "30", "-i", coverPath,
    "-i", audioPath,
    "-filter_complex", "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[cover];[1:a]aformat=channel_layouts=mono,showwaves=s=1540x180:mode=line:colors=0xD58A60:rate=30,format=rgba,colorkey=0x000000:0.01:0.0[wave];[cover][wave]overlay=(W-w)/2:H-h-86:shortest=1,format=yuv420p[video]",
    "-map", "[video]", "-map", "1:a",
    "-c:v", "mpeg4", "-q:v", "3", "-r", "30",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest", "-movflags", "+faststart", "-y", outputPath,
  ];
}
