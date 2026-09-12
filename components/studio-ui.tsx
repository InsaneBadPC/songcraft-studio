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

export function Shimmer({ width = "100%", height = 16, radius = 12 }: { width?: any; height?: number; radius?: number }) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1300, useNativeDriver: true })).start(); }, [anim]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-200, 200] });
  return (
    <View style={{ width: width as any, height, borderRadius: radius, backgroundColor: "rgba(124,58,237,0.08)", borderWidth: 1, borderColor: "rgba(124,58,237,0.12)", overflow: "hidden" }}>
      <Animated.View style={{ width: "55%", height: "100%", backgroundColor: "rgba(255,255,255,0.08)", transform: [{ translateX }] }} />
      <LinearGradient colors={["transparent", "rgba(124,58,237,0.12)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, opacity: 0.5 }} />
    </View>
  );
}

export const StudioHeader = memo(function StudioHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.muted }]}>{eyebrow.toUpperCase()}</Text> : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginBottom: 8, shadowColor: colors.primary, shadowOpacity: 0.6, shadowRadius: 8, elevation: 4 }} />
        </View>
        <View style={styles.headerAccent}>
          <LinearGradient colors={["#7C3AED", "#06B6D4", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerGradient} />
          <View style={[styles.headerGlow, { backgroundColor: "#7C3AED" }]} />
        </View>
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
});

export function PrimaryButton({ label, icon = "add", onPress, disabled = false }: { label: string; icon?: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; disabled?: boolean }) {
  const handlePress = () => { if (!disabled) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{}); onPress(); } };
  return (
    <Pressable disabled={disabled} onPress={handlePress} style={({ pressed }) => [styles.primaryButton, { opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed && !disabled ? 0.96 : 1 }], shadowColor: disabled ? "transparent" : "#7C3AED", shadowOpacity: disabled ? 0 : pressed ? 0.4 : 0.25, shadowRadius: pressed ? 8 : 16, shadowOffset: { width: 0, height: pressed ? 2 : 6 }, elevation: disabled ? 0 : 8 }]}>
      <LinearGradient colors={disabled ? ["#1E293B", "#1E293B"] : ["#7C3AED", "#6366F1", "#06B6D4", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill as any} />
      <View style={[StyleSheet.absoluteFill as any, { backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", borderRadius: 16 }]} />
      <MaterialIcons name={icon} size={19} color="#FFFFFF" style={{ zIndex: 1, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 2 }} />
      <Text style={[styles.primaryButtonText, { zIndex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={() => { Haptics.selectionAsync().catch(()=>{}); onPress(); }} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: "rgba(15,23,42,0.8)", borderColor: "rgba(124,58,237,0.22)", borderWidth: 1, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], shadowColor: "#7C3AED", shadowOpacity: pressed ? 0.12 : 0.08, shadowRadius: 12, elevation: 4 }]}><MaterialIcons name={icon} size={18} color={colors.foreground} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>{label}</Text></Pressable>;
}

export function IconButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; onPress: () => void }) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { Haptics.selectionAsync().catch(()=>{}); onPress(); }} style={({ pressed }) => [styles.iconButton, { backgroundColor: "rgba(15,23,42,0.9)", borderColor: "rgba(124,58,237,0.18)", borderWidth: 1, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }], shadowColor: "#7C3AED", shadowOpacity: pressed ? 0.18 : 0.10, shadowRadius: 10, elevation: 4 }]}><MaterialIcons name={icon} size={20} color={colors.foreground} /></Pressable>;
}

export function GlassCard({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[styles.glassCard, { backgroundColor: "rgba(15,23,42,0.72)", borderColor: "rgba(124,58,237,0.14)", shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 }, style]}><LinearGradient colors={["rgba(124,58,237,0.08)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1 }} pointerEvents="none" />{children}</View>;
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors();
  return <View style={styles.sectionTitle}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 4 }} /><Text style={[styles.sectionHeading, { color: colors.foreground }]}>{title}</Text></View>{right}</View>;
}

export function StatusChip({ state }: { state: "draft" | "complete" | "cloud" }) {
  const colors = useColors();
  const complete = state === "complete" || state === "cloud";
  const label = state === "draft" ? "ROZPRACOVÁNO" : state === "complete" ? "HOTOVO" : "CLOUD";
  return <View style={[styles.statusChip, { backgroundColor: complete ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.12)", borderColor: complete ? "rgba(16,185,129,0.28)" : "rgba(255,255,255,0.08)", shadowColor: complete ? colors.success : "transparent", shadowOpacity: complete ? 0.18 : 0, shadowRadius: 6 }]}><View style={[styles.statusDot, { backgroundColor: complete ? colors.success : colors.muted, shadowColor: complete ? colors.success : "transparent", shadowOpacity: 0.6, shadowRadius: 4 }]} /><Text style={[styles.statusText, { color: complete ? colors.success : colors.muted }]}>{label}</Text></View>;
}

export function CoverArt({ uri, title, size = 64 }: { uri?: string | null; title: string; size?: number }) {
  const colors = useColors();
  const resolvedUri = resolveAssetUrl(uri);
  if (resolvedUri) return <View style={{ width: size, height: size, borderRadius: Math.max(16, size * 0.22), borderWidth: 1, borderColor: "rgba(124,58,237,0.16)", shadowColor: "#7C3AED", shadowOpacity: 0.18, shadowRadius: 12, elevation: 6, overflow: "hidden", backgroundColor: colors.surface }}><Image source={{ uri: resolvedUri }} contentFit="cover" style={{ width: size, height: size }} /><LinearGradient colors={["transparent", "rgba(124,58,237,0.12)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: size * 0.4 }} /></View>;
  return <View style={[styles.coverFallback, { width: size, height: size, borderRadius: Math.max(16, size * 0.22), backgroundColor: "rgba(124,58,237,0.12)", borderWidth: 1, borderColor: "rgba(124,58,237,0.22)", shadowColor: "#7C3AED", shadowOpacity: 0.16, shadowRadius: 10 }]}><MaterialIcons name="music-note" size={size * 0.36} color={colors.primary} /><Text numberOfLines={1} style={[styles.coverLetter, { color: colors.primary }]}>{title.slice(0, 1).toUpperCase()}</Text><View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.12)" }} /></View>;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string; action?: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.empty, { borderColor: "rgba(124,58,237,0.14)", backgroundColor: "rgba(15,23,42,0.6)", shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 16, elevation: 4 }]}><LinearGradient colors={["rgba(124,58,237,0.08)", "transparent"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1 }} /><View style={[styles.emptyIcon, { backgroundColor: "rgba(124,58,237,0.14)", borderWidth: 1, borderColor: "rgba(124,58,237,0.22)", shadowColor: "#7C3AED", shadowOpacity: 0.22, shadowRadius: 12 }]}><MaterialIcons name={icon} size={28} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{text}</Text>{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

export function LoadingState({ label = "Načítám studio…" }: { label?: string }) {
  const colors = useColors();
  return <View style={styles.loading}><View style={{ gap: 12, width: "100%", paddingHorizontal: 32 }}><Shimmer height={14} radius={12} /><Shimmer height={14} radius={12} width="75%" /><Shimmer height={14} radius={12} width="50%" /></View><Text style={[styles.loadingText, { color: colors.muted }]}>{label}</Text></View>;
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
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24, paddingTop: 8 },
  headerCopy: { flex: 1, gap: 7 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 1.6, textTransform: "uppercase", opacity: 0.9 },
  title: { fontSize: 36, lineHeight: 38, fontWeight: "900", letterSpacing: -1.0, textShadowColor: "rgba(124,58,237,0.22)", textShadowRadius: 12 },
  headerAccent: { marginTop: 12, height: 2, borderRadius: 1, overflow: "hidden", width: 96, flexDirection: "row" },
  headerGradient: { flex: 1 },
  headerGlow: { position: "absolute", top: -6, left: 0, right: 0, height: 14, opacity: 0.22, borderRadius: 7 },
  headerAction: { paddingBottom: 2 },
  primaryButton: { minHeight: 48, minWidth: 44, borderRadius: 16, paddingHorizontal: 20, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", letterSpacing: -0.3, textShadowColor: "rgba(0,0,0,0.22)", textShadowRadius: 2 },
  secondaryButton: { minHeight: 44, minWidth: 44, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 14, fontWeight: "600" },
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  glassCard: { borderRadius: 20, borderWidth: 1, padding: 16, overflow: "hidden" },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 14 },
  sectionHeading: { fontSize: 20, lineHeight: 24, fontWeight: "800", letterSpacing: -0.4 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 20, borderWidth: 1 },
  statusDot: { height: 6, width: 6, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  coverFallback: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverLetter: { position: "absolute", bottom: 8, right: 10, fontSize: 18, fontWeight: "900", opacity: 0.7 },
  empty: { borderWidth: 1, borderRadius: 24, padding: 32, alignItems: "center", marginTop: 12, overflow: "hidden" },
  emptyIcon: { width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 8, letterSpacing: -0.3 },
  emptyText: { fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 300, opacity: 0.9 },
  emptyAction: { marginTop: 22, alignSelf: "stretch" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 40 },
  loadingText: { fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
});
