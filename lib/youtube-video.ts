import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { youtubeFfmpegArgs } from "@/lib/youtube-video-args";

function safeName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "songcraft-youtube";
}

function absoluteUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const apiBaseUrl = getApiBaseUrl();
  return apiBaseUrl ? `${apiBaseUrl}${url}` : url;
}

export async function createAndShareYoutubeVideo(input: { audioUrl: string; coverUrl: string; title: string; artist?: string }) {
  if (Platform.OS === "web") {
    throw new Error("Video se vytváří přímo v Android APK. Otevři SongCraft Studio v telefonu a spusť export tam.");
  }
  const { execute } = require("ffmpeg-expo") as { execute: (args: string[]) => Promise<{ returnCode: number }> };
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = FileSystem.cacheDirectory;
  if (!base) throw new Error("Dočasné úložiště telefonu není dostupné.");
  const coverPath = `${base}songcraft-${stamp}-cover.jpg`;
  const audioPath = `${base}songcraft-${stamp}-audio.mp3`;
  const fileName = `${safeName(input.title)}-YouTube-1080p.mp4`;
  const outputPath = `${base}${stamp}-${fileName}`;

  try {
    await Promise.all([
      FileSystem.downloadAsync(absoluteUrl(input.coverUrl), coverPath),
      FileSystem.downloadAsync(absoluteUrl(input.audioUrl), audioPath),
    ]);
    const result = await execute(youtubeFfmpegArgs(coverPath, audioPath, outputPath, input.title, input.artist));
    if (result.returnCode !== 0) throw new Error("Telefon nemohl dokončit vytvoření MP4. Zkus to znovu s jiným coverem nebo kratší MP3.");
    const output = await FileSystem.getInfoAsync(outputPath);
    if (!output.exists) throw new Error("Video nebylo po renderu nalezeno.");
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(outputPath, { mimeType: "video/mp4", dialogTitle: "Uložit nebo sdílet YouTube video" });
    } else {
      await Linking.openURL(outputPath);
    }
    return { uri: outputPath, fileName };
  } finally {
    await Promise.all([coverPath, audioPath].map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)));
  }
}
