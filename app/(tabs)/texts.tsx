import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CoverArt, EmptyState, IconButton, LoadingState, SectionTitle, StatusChip, StudioHeader, formatDate } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";

export default function TextsScreen() {
  const colors = useColors();
  const { isAuthenticated, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [albumId, setAlbumId] = useState<number | null>(null);
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const records = useMemo(() => (snapshot.data?.documents ?? []).filter((document) => (!albumId || document.albumId === albumId) && `${document.title} ${document.lyrics ?? ""} ${document.stylePrompt ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [albumId, search, snapshot.data?.documents]);
  if (loading || (isAuthenticated && snapshot.isLoading)) return <ScreenContainer><LoadingState /></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock" title="Přihlášení je potřeba" text="Texty se ukládají do soukromého cloudového prostoru." action={<Pressable onPress={() => void startOAuthLogin()} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Přihlásit se</Text></Pressable>} /></ScreenContainer>;
  return <ScreenContainer className="px-5"><FlatList data={records} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} ListHeaderComponent={<>
    <StudioHeader eyebrow="Kreativní dílna" title="Texty" action={<IconButton label="Nový text" icon="add" onPress={() => router.push("/text/new" as never)} />} />
    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="search" size={20} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Hledat v názvech, textech a promptech" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground }]} /></View>
    <SectionTitle title="Album" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><FilterChip active={!albumId} label="Všechna" onPress={() => setAlbumId(null)} />{snapshot.data?.albums.map((album) => <FilterChip key={album.id} active={albumId === album.id} label={album.name} onPress={() => setAlbumId(album.id)} />)}</ScrollView>
    <SectionTitle title={`${records.length} ${records.length === 1 ? "položka" : records.length < 5 ? "položky" : "položek"}`} />
  </>} renderItem={({ item }) => <Pressable onPress={() => router.push(`/text/${item.id}` as never)} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><CoverArt uri={item.coverUrl} title={item.title} size={60} /><View style={styles.copy}><View style={styles.copyTop}><Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{item.title}</Text><StatusChip state={item.status} /></View><Text numberOfLines={1} style={[styles.details, { color: colors.muted }]}>{item.lyrics?.trim() ? item.lyrics.trim().replace(/\n+/g, " · ") : "Zatím bez textu"}</Text><Text style={[styles.date, { color: colors.muted }]}>Upraveno {formatDate(item.updatedAt)}</Text></View><MaterialIcons name="chevron-right" size={22} color={colors.muted} /></Pressable>} ListEmptyComponent={<EmptyState icon="description" title={search ? "Žádná shoda" : "Textová dílna je prázdná"} text={search ? "Zkus změnit hledaný výraz nebo filtr alba." : "Založ koncept. Prompt, text, poznámky a přebal zůstanou pohromadě."} />} />
  </ScreenContainer>;
}
function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const colors = useColors(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.filter, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><Text numberOfLines={1} style={[styles.filterText, { color: active ? "#141317" : colors.foreground }]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ content: { paddingTop: 14, paddingBottom: 30 }, search: { height: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 }, filters: { paddingRight: 20, gap: 8 }, filter: { height: 36, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderRadius: 18 }, filterText: { fontSize: 13, fontWeight: "700" }, row: { borderWidth: 1, borderRadius: 19, padding: 10, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, copy: { flex: 1, gap: 4 }, copyTop: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" }, name: { flex: 1, fontSize: 15, fontWeight: "800" }, details: { fontSize: 12, lineHeight: 16 }, date: { fontSize: 11, fontWeight: "600" }, login: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, loginText: { color: "#141317", fontWeight: "800" } });
