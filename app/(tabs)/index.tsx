import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { CoverArt, EmptyState, LoadingState, PrimaryButton, SectionTitle, StatusChip, StudioHeader, formatDate } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function HomeScreen() {
  const colors = useColors();
  const { isAuthenticated, loading } = useAuth();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });

  if (loading || (isAuthenticated && snapshot.isLoading)) return <ScreenContainer><LoadingState /></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock-outline" title="Tvoje studio je soukromé" text="Přihlas se, aby se texty, přebaly a verze skladeb bezpečně synchronizovaly mezi Androidem a webem." action={<PrimaryButton label="Přihlásit se" icon="login" onPress={() => void startOAuthLogin()} />} /></ScreenContainer>;

  const data = snapshot.data;
  const drafts = data?.documents.filter((document) => document.status === "draft") ?? [];
  const recent = data?.documents.slice(0, 3) ?? [];
  const albumCount = data?.albums.length ?? 0;
  const songCount = data?.songs.length ?? 0;

  return <ScreenContainer className="px-5"><FlatList data={recent} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} ListHeaderComponent={<>
    <StudioHeader eyebrow="Kreativní pracovní prostor" title="SongCraft Studio" action={<Pressable onPress={() => void snapshot.refetch()} style={({ pressed }) => [styles.sync, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="cloud-done" size={19} color={colors.success} /></Pressable>} />
    <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.heroCopy}><Text style={[styles.heroLabel, { color: colors.primary }]}>DALŠÍ KROK</Text><Text style={[styles.heroTitle, { color: colors.foreground }]}>{drafts.length ? `Pokračuj na „${drafts[0].title}“` : "Začni nový nápad"}</Text><Text style={[styles.heroText, { color: colors.muted }]}>{drafts.length ? "Rozpracovaný text čeká na další verš, prompt nebo přebal." : "Založ první text. Vše se uloží do tvého cloudového studia."}</Text></View><PrimaryButton label={drafts.length ? "Otevřít" : "Nový text"} icon={drafts.length ? "edit" : "add"} onPress={() => router.push((drafts.length ? `/text/${drafts[0].id}` : "/text/new") as never)} /></View>
    <View style={styles.metrics}><Metric value={drafts.length} label="konceptů" color={colors.primary} /><Metric value={songCount} label="hotových skladeb" color={colors.success} /><Metric value={albumCount} label="alb" color={colors.foreground} /></View>
    <SectionTitle title="Naposledy upravené" right={<Pressable onPress={() => router.push("/(tabs)/texts" as never)}><Text style={[styles.link, { color: colors.primary }]}>Všechny texty</Text></Pressable>} />
  </>} renderItem={({ item }) => <Pressable onPress={() => router.push(`/text/${item.id}` as never)} style={({ pressed }) => [styles.documentRow, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.72 : 1 }]}><CoverArt uri={item.coverUrl} title={item.title} size={52} /><View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.rowMeta, { color: colors.muted }]}>{formatDate(item.updatedAt)} · {item.stylePrompt ? "prompt připraven" : "bez promptu"}</Text></View><StatusChip state={item.status} /></Pressable>} ListEmptyComponent={<EmptyState icon="edit-note" title="Ještě tu není žádný text" text="Každý koncept může nést prompt, text, poznámky i vlastní přebal." action={<PrimaryButton label="Vytvořit první text" onPress={() => router.push("/text/new" as never)} />} />} />
  </ScreenContainer>;
}

function Metric({ value, label, color }: { value: number; label: string; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({ content: { paddingTop: 14, paddingBottom: 28 }, sync: { height: 43, width: 43, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, hero: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 20 }, heroCopy: { gap: 7 }, heroLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, heroTitle: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3 }, heroText: { fontSize: 14, lineHeight: 20 }, metrics: { flexDirection: "row", gap: 10, marginTop: 12 }, metric: { flex: 1, minHeight: 78, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 12 }, metricValue: { fontSize: 23, fontWeight: "900", letterSpacing: -0.4 }, metricLabel: { color: "#9B91A7", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 }, link: { fontSize: 13, fontWeight: "800" }, documentRow: { borderWidth: 1, borderRadius: 18, padding: 11, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 9 }, rowCopy: { flex: 1, gap: 3 }, rowTitle: { fontSize: 15, fontWeight: "800" }, rowMeta: { fontSize: 12, fontWeight: "500" } });
