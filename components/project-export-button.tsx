import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, Alert, Pressable, StyleSheet } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { downloadOrShareFile } from "@/lib/download-and-share";
import { trpc } from "@/lib/trpc";

export function ProjectExportButton({ kind, id, label = "Export projektu" }: { kind: "text" | "song"; id: string; label?: string }) {
  const exportItem = trpc.studio.exportItem.useMutation();

  const run = async () => {
    try {
      const result = await exportItem.mutateAsync({ kind, id });
      await downloadOrShareFile(result.url, result.fileName, "application/zip", label);
    } catch (error) {
      Alert.alert("Export se nepodařil", error instanceof Error ? error.message : "Zkus to znovu.");
    }
  };

  return <IconButton label={exportItem.isPending ? "Připravuji export" : label} icon="download" onPress={() => void run()} disabled={exportItem.isPending} />;
}

function IconButton({ label, icon, onPress, disabled }: { label: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled || pressed ? 0.55 : 1 }]}
    >
      {disabled ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name={icon} size={20} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});