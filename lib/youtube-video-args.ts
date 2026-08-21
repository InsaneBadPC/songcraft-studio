export function youtubeFfmpegArgs(coverPath: string, audioPath: string, outputPath: string) {
  return [
    "-loop", "1", "-framerate", "30", "-i", coverPath,
    "-i", audioPath,
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-c:v", "mpeg4", "-q:v", "3", "-r", "30",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest", "-movflags", "+faststart", "-y", outputPath,
  ];
}
