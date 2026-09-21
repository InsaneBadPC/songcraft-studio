import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";
import { checkForUpdate, getSkippedVersion, installUpdate, skipVersion, type AppUpdate } from "@/lib/app-update";

/**
 * Nenápadný pruh v horní části aplikace, který se objeví jen když je na GitHubu novější APK.
 * Stažení i spuštění instalace probíhá přímo tady – bez prohlížeče a bez ručního přesunu souboru.
 */
export function UpdateBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let active = true;
    checkForUpdate()
      .then(async (found) => {
        if (!active || !found) return;
        const skipped = await getSkippedVersion();
        if (active && skipped !== found.version) setUpdate(found);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!update || dismissed) return null;

  const start = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setInstalling(true);
    setProgress(0);
    try {
      await installUpdate(update, setProgress);
      setLaunched(true);
    } catch (error) {
      Alert.alert("Aktualizace se nezdařila", error instanceof Error ? error.message : "Zkus to znovu.");
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    Haptics.selectionAsync().catch(() => {});
    setDismissed(true);
    if (!launched) void skipVersion(update.version);
  };

  const percent = Math.round(progress * 100);
  const subtitle = installing
    ? `Stahuji… ${percent} %`
    : launched
      ? "Dokonči instalaci v systémovém okně."
      : "Aktualizuj přímo v aplikaci, bez stahování v prohlížeči.";

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={[styles.card, { top: insets.top + 8, backgroundColor: colors.surfaceElevated, borderColor: colors.borderHighlight }]}>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: `${colors.primary}26` }]}>
            <MaterialIcons name="system-update" size={22} color={colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.foreground }]}>Nová verze {update.version}</Text>
            <Text style={[styles.text, { color: colors.muted }]}>{subtitle}</Text>
          </View>
        </View>
        {installing ? (
          <View style={[styles.track, { backgroundColor: `${colors.primary}1F` }]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
          </View>
        ) : (
          <View style={styles.actions}>
            {!launched ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Aktualizovat na verzi ${update.version}`}
                onPress={() => void start()}
                style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.9 : 1 }]}
              >
                <MaterialIcons name="download" size={18} color="#141317" />
                <Text style={styles.primaryText}>Aktualizovat</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={launched ? "Zavřít oznámení" : "Připomenout později"}
              onPress={dismiss}
              style={({ pressed }) => [styles.ghost, { borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.ghostText, { color: colors.foreground }]}>{launched ? "Zavřít" : "Později"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 24 },
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 12,
    shadowColor: "#7C3AED",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  badge: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  text: { fontSize: 12, lineHeight: 17 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  actions: { flexDirection: "row", gap: 9 },
  primary: { flex: 1, minHeight: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#141317", fontSize: 14, fontWeight: "900" },
  ghost: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 14, fontWeight: "800" },
});
