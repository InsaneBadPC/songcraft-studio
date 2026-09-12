import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { memo, type ReactNode, useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

export function resolveAssetUrl(uri?: string | null) {
  if (!uri || /^(?:https?:|data:|file:|content:)/i.test(uri)) return uri ?? null;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${uri.startsWith("/") ? uri : `/${uri}`}` : uri;
}

// Shimmer - skeletal loading with animated gradient
export function Shimmer({ width = "100%", height = 16, radius = 8 }: { width?: any; height?: number; radius?: number }) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true })).start();
  }, [anim]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });
  return (
    <View style={{ width: width as any, height, borderRadius: radius, backgroundColor: (colors as any).surfaceElevated || colors.surface, overflow: "hidden" }}>
      <Animated.View style={{ width: "60%", height: "100%", backgroundColor: "rgba(255,255,255,0.06)", transform: [{ translateX }] }} />
    </View>
  );
}

export const StudioHeader = memo(function StudioHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.muted }]}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <View style={[styles.headerAccent, { backgroundColor: (colors as any).borderHighlight || colors.border }]}>
          <LinearGradient colors={[colors.primary, "#8B5CF6", "#06B6D4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerGradient} />
        </View>
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
});

export function PrimaryButton({ label, icon = "add", onPress, disabled = false }: { label: string; icon?: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; disabled?: boolean }) {
  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress();
    }
  };
  return (
    <Pressable disabled={disabled} onPress={handlePress} style={({ pressed }) => [styles.primaryButton, { opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] }]}>
      <LinearGradient colors={disabled ? ["#1F2937", "#1F2937"] : ["#3B82F6", "#6366F1", "#8B5CF6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill as any} />
      <View style={[StyleSheet.absoluteFill as any, { backgroundColor: "rgba(255,255,255,0.08)" } as any]} />
      <MaterialIcons name={icon} size={19} color="#FFFFFF" style={{ zIndex: 1 }} />
      <Text style={[styles.primaryButtonText, { zIndex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <MaterialIcons name={icon} size={18} color={colors.foreground} />
      <Text style={[styles.secondaryText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <MaterialIcons name={icon} size={20} color={colors.foreground} />
    </Pressable>
  );
}

export function GlassCard({ children, style }: { children: ReactNode; style?: any }) {
  const colors = useColors();
  return (
    <View style={[styles.glassCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, style]}>
      {children}
    </View>
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
  return <View style={[styles.statusChip, { backgroundColor: complete ? `rgba(16,185,129,0.12)` : `rgba(148,163,184,0.12)`, borderColor: complete ? `rgba(16,185,129,0.22)` : `rgba(255,255,255,0.08)` }]}><View style={[styles.statusDot, { backgroundColor: complete ? colors.success : colors.muted }]} /><Text style={[styles.statusText, { color: complete ? colors.success : colors.muted }]}>{label}</Text></View>;
}

export function CoverArt({ uri, title, size = 64 }: { uri?: string | null; title: string; size?: number }) {
  const colors = useColors();
  const resolvedUri = resolveAssetUrl(uri);
  if (resolvedUri) return <Image source={{ uri: resolvedUri }} contentFit="cover" style={{ width: size, height: size, borderRadius: Math.max(16, size * 0.22), backgroundColor: colors.surface, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }} />;
  return <View style={[styles.coverFallback, { width: size, height: size, borderRadius: Math.max(16, size * 0.22), backgroundColor: (colors as any).surfaceElevated || colors.surface, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }]}><MaterialIcons name="music-note" size={size * 0.36} color={colors.primary} /><Text numberOfLines={1} style={[styles.coverLetter, { color: colors.primary }]}>{title.slice(0, 1).toUpperCase()}</Text></View>;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string; action?: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}><View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}14`, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }]}><MaterialIcons name={icon} size={28} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{text}</Text>{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

export function LoadingState({ label = "Načítám studio…" }: { label?: string }) {
  const colors = useColors();
  return <View style={styles.loading}><View style={{ gap: 12, width: "100%", paddingHorizontal: 32 }}><Shimmer height={14} radius={8} /><Shimmer height={14} radius={8} width="75%" /><Shimmer height={14} radius={8} width="50%" /></View><Text style={[styles.loadingText, { color: colors.muted }]}>{label}</Text></View>;
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
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24, paddingTop: 4 },
  headerCopy: { flex: 1, gap: 6 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.85 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "800", letterSpacing: -0.8, fontVariant: ["tabular-nums"] as any },
  headerAccent: { marginTop: 10, height: 1, borderRadius: 1, overflow: "hidden", width: 88, opacity: 0.9 },
  headerGradient: { flex: 1 },
  headerAction: { paddingBottom: 2 },
  primaryButton: { minHeight: 48, minWidth: 44, borderRadius: 16, paddingHorizontal: 20, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  secondaryButton: { minHeight: 44, minWidth: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 14, fontWeight: "600" },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  glassCard: { borderRadius: 20, borderWidth: 1, padding: 16, overflow: "hidden" },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 14 },
  sectionHeading: { fontSize: 20, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 20, borderWidth: 1 },
  statusDot: { height: 6, width: 6, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.7 },
  coverFallback: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverLetter: { position: "absolute", bottom: 8, right: 10, fontSize: 18, fontWeight: "900", opacity: 0.7 },
  empty: { borderWidth: 1, borderRadius: 24, padding: 32, alignItems: "center", marginTop: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8, letterSpacing: -0.2 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300, opacity: 0.9 },
  emptyAction: { marginTop: 22, alignSelf: "stretch" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 40 },
  loadingText: { fontSize: 13, fontWeight: "500", letterSpacing: 0.2 },
});
