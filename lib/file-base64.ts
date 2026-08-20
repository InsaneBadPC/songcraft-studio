import { File } from "expo-file-system";
import { Platform } from "react-native";

export async function assetToBase64(uri: string, providedBase64?: string | null) {
  if (providedBase64) return providedBase64;
  if (Platform.OS !== "web") return new File(uri).base64();

  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Soubor se nepodařilo načíst."));
    reader.onloadend = () => {
      const dataUrl = String(reader.result ?? "");
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}
