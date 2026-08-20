import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";

function absoluteUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const apiBaseUrl = getApiBaseUrl();
  return apiBaseUrl ? `${apiBaseUrl}${url}` : url;
}

function safeName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "songcraft-download";
}

export async function downloadOrShareFile(url: string, fileName: string, mimeType: string, title: string) {
  const remoteUrl = absoluteUrl(url);
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      const anchor = document.createElement("a");
      anchor.href = remoteUrl;
      anchor.download = safeName(fileName);
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    await Linking.openURL(remoteUrl);
    return;
  }
  const localUri = `${FileSystem.cacheDirectory}${Date.now()}-${safeName(fileName)}`;
  const result = await FileSystem.downloadAsync(remoteUrl, localUri);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: title });
    return;
  }
  await Linking.openURL(result.uri);
}

export async function saveFinishedMp3(url: string, fileName: string) {
  return downloadOrShareFile(url, fileName, "audio/mpeg", "Uložit nebo sdílet hotovou MP3");
}
