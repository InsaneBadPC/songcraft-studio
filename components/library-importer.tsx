import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { ProjectImportCard } from "@/components/project-import-card";
import { useColors } from "@/hooks/use-colors";

export function LibraryImporter() {
  const colors = useColors();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Import projektu"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}
      >
        <MaterialIcons name="upload-file" size={20} color={colors.primary} />
        <Text style={[styles.triggerText, { color: colors.foreground }]}>Import</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.shade}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.top}>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>Import projektu</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Import ze ZIP exportu. Vznikne nová skladba.</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} style={[styles.close, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="close" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <ProjectImportCard onImported={() => setVisible(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { height: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  triggerText: { fontSize: 13, fontWeight: "900" },
  shade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  sheet: { borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  handle: { width: 42, height: 4, borderRadius: 3, alignSelf: "center", marginVertical: 10 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 13, justifyContent: "center", alignItems: "center" },
});