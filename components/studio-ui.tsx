import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

export function resolveAssetUrl(uri?: string | null) {
  if (!uri || /^(?:https?:|data:|file:|content:)/i.test(uri)) return uri ?? null;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${uri.startsWith("/") ? uri : `/${uri}`}` : uri;
}

export function StudioHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function PrimaryButton({ label, icon = "add", onPress, disabled = false }: { label: string; icon?: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: disabled ? 0.45 : pressed ? 0.84 : 1 }]}>
      <MaterialIcons name={icon} size={19} color="#141317" />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}>
      <MaterialIcons name={icon} size={21} color={colors.foreground} />
    </Pressable>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors();
  return <View style={styles.sectionTitle}><Text style={[styles.sectionHeading, { color: colors.foreground }]}>{title}</Text>{right}</View>;
}

export function StatusChip({ state }: { state: "draft" | "complete" | "cloud" }) {
  const colors = useColors();
  const complete = state === "complete" || state === "cloud";
  const label = state === "draft" ? "ROZPRACOVÁNO" : state === "complete" ? "HOTOVO" : "CLOUD";
  return <View style={[styles.statusChip, { backgroundColor: complete ? `${colors.success}22` : `${colors.muted}22` }]}><View style={[styles.statusDot, { backgroundColor: complete ? colors.success : colors.muted }]} /><Text style={[styles.statusText, { color: complete ? colors.success : colors.muted }]}>{label}</Text></View>;
}

export function CoverArt({ uri, title, size = 64 }: { uri?: string | null; title: string; size?: number }) {
  const colors = useColors();
  const resolvedUri = resolveAssetUrl(uri);
  if (resolvedUri) return <Image source={{ uri: resolvedUri }} contentFit="cover" style={{ width: size, height: size, borderRadius: Math.max(10, size * 0.16), backgroundColor: colors.surface }} />;
  return <View style={[styles.coverFallback, { width: size, height: size, borderRadius: Math.max(10, size * 0.16), backgroundColor: `${colors.primary}24` }]}><MaterialIcons name="music-note" size={size * 0.38} color={colors.primary} /><Text numberOfLines={1} style={[styles.coverLetter, { color: colors.primary }]}>{title.slice(0, 1).toUpperCase()}</Text></View>;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string; action?: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}><View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}1F` }]}><MaterialIcons name={icon} size={28} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{text}</Text>{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

export function LoadingState({ label = "Načítám studio…" }: { label?: string }) {
  const colors = useColors();
  return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.muted }]}>{label}</Text></View>;
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "bez data";
  const date = new Date(value);
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short" }).format(date);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 22 },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: "800", letterSpacing: 1.2 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.6 },
  primaryButton: { minHeight: 48, borderRadius: 15, paddingHorizontal: 17, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" },
  primaryButtonText: { color: "#141317", fontSize: 15, fontWeight: "800" },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 25, marginBottom: 11 },
  sectionHeading: { fontSize: 18, lineHeight: 24, fontWeight: "800", letterSpacing: -0.2 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 24, borderRadius: 20 },
  statusDot: { height: 6, width: 6, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.65 },
  coverFallback: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverLetter: { position: "absolute", bottom: 7, right: 9, fontSize: 17, fontWeight: "900", opacity: 0.75 },
  empty: { borderWidth: 1, borderRadius: 22, padding: 28, alignItems: "center", marginTop: 10 },
  emptyIcon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  emptyTitle: { fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 7 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 275 },
  emptyAction: { marginTop: 20, alignSelf: "stretch" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontWeight: "600" },
});
