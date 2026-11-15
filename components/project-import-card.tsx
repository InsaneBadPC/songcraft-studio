import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { assetToBase64 } from "@/lib/file-base64";
import { trpc } from "@/lib/trpc";
import { OnPrimary } from "@/lib/design-tokens";

export function ProjectImportCard({ onImported }: { onImported?: () => void }) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const importItem = trpc.studio.importItem.useMutation();
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const base64 = await assetToBase64(asset.uri, asset.base64);
      const imported = await importItem.mutateAsync({ fileName: asset.name, base64 });
      await utils.studio.snapshot.invalidate();
      onImported?.();
      Alert.alert(
        imported.duplicate ? "Importováno jako duplikát" : "Import dokončen",
        imported.kind === "song" ? "Skladba byla přidána do knihovny." : "Text byl přidán do katalogu textů.",
      );
      router.replace(imported.kind === "song" ? `/song/${imported.id}` as never : `/text/${imported.id}` as never);
    } catch (error) {
      Alert.alert("Import projektu se nepodařil", error instanceof Error ? error.message : "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: `${colors.primary}1A` }]}>
        <MaterialIcons name="folder-zip" size={22} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Import projektu</Text>
        <Text style={[styles.text, { color: colors.muted }]}>Vyber ZIP export z druhého projektu. Vytvoří se nová položka.</Text>
      </View>
      <Pressable
        disabled={busy || importItem.isPending}
        onPress={() => void pick()}
        style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: busy || importItem.isPending || pressed ? 0.65 : 1 }]}
      >
        {busy || importItem.isPending ? <ActivityIndicator size="small" color={OnPrimary} /> : <MaterialIcons name="upload-file" size={19} color={OnPrimary} />}
        <Text style={styles.actionText}>{busy || importItem.isPending ? "Importuji…" : "Vybrat ZIP"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  icon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  copy: { gap: 3 },
  title: { fontSize: 14, fontWeight: "900" },
  text: { fontSize: 11, lineHeight: 15 },
  action: { minHeight: 46, borderRadius: 15, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  actionText: { color: OnPrimary, fontSize: 14, fontWeight: "900" },
});