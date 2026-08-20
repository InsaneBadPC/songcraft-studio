import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMemo, useState } from "react";

import { CoverArt, EmptyState, IconButton, LoadingState, SectionTitle, StudioHeader } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function LibraryScreen() {
  const colors = useColors();
  const { isAuthenticated, loading } = useAuth();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const [search, setSearch] = useState("");
  const [albumId, setAlbumId] = useState<number | null>(null);
  const [finalOnly, setFinalOnly] = useState(false);
  const songs = useMemo(() => { const versions = snapshot.data?.versions ?? []; return (snapshot.data?.songs ?? []).filter((song) => (!albumId || song.albumId === albumId) && song.title.toLowerCase().includes(search.toLowerCase()) && (!finalOnly || versions.some((version) => version.songId === song.id && version.isFinal))); }, [albumId, finalOnly, search, snapshot.data?.songs, snapshot.data?.versions]);
  if (loading || (isAuthenticated && snapshot.isLoading)) return <ScreenContainer><LoadingState label="Načítám knihovnu…" /></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock" title="Knihovna je soukromá" text="Přihlas se, aby se hotové skladby načetly z tvého cloudu." action={<Pressable onPress={() => void startOAuthLogin()} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Přihlásit se</Text></Pressable>} /></ScreenContainer>;
  return <ScreenContainer className="px-5"><FlatList data={songs} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} ListHeaderComponent={<>
    <StudioHeader eyebrow="Databáze skladeb" title="Knihovna skladeb" action={<IconButton label="Nová skladba" icon="add" onPress={() => router.push("/song/new" as never)} />} />
    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="search" size={20} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Hledat hotovou skladbu" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground }]} /></View>
    <SectionTitle title="Podle alba" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><FilterChip active={!albumId} label="Všechna alba" onPress={() => setAlbumId(null)} />{snapshot.data?.albums.map((album) => <FilterChip key={album.id} active={albumId === album.id} label={album.name} onPress={() => setAlbumId(album.id)} />)}</ScrollView>
    <SectionTitle title="Stav vydání" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><FilterChip active={!finalOnly} label="Všechny skladby" onPress={() => setFinalOnly(false)} /><FilterChip active={finalOnly} label="Pouze finální" onPress={() => setFinalOnly(true)} /></ScrollView>
    <SectionTitle title={`${songs.length} ${songs.length === 1 ? "skladba" : songs.length < 5 ? "skladby" : "skladeb"}`} />
  </>} renderItem={({ item }) => { const source = snapshot.data?.documents.find((document) => document.id === item.sourceDocumentId); const songVersions = snapshot.data?.versions.filter((version) => version.songId === item.id) ?? []; const finalVersion = songVersions.find((version) => version.isFinal); const album = snapshot.data?.albums.find((entry) => entry.id === item.albumId); return <Pressable onPress={() => router.push(`/song/${item.id}` as never)} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><CoverArt uri={item.coverUrl ?? source?.coverUrl ?? album?.coverUrl} title={item.title} size={62} /><View style={styles.copy}><Text numberOfLines={1} style={[styles.songName, { color: colors.foreground }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.songMeta, { color: colors.muted }]}>{album?.name ?? "Bez alba"} · {songVersions.length} {songVersions.length === 1 ? "verze" : songVersions.length < 5 ? "verze" : "verzí"}</Text><View style={styles.ready}><MaterialIcons name={finalVersion ? "verified" : "check-circle"} size={13} color={finalVersion ? colors.success : colors.primary} /><Text style={[styles.readyText, { color: finalVersion ? colors.success : colors.primary }]}>{finalVersion ? `finální: ${finalVersion.label}` : "text a prompt připraveny"}</Text></View></View><MaterialIcons name="chevron-right" size={23} color={colors.muted} /></Pressable>; }} ListEmptyComponent={<EmptyState icon={finalOnly ? "verified" : "library-music"} title={finalOnly ? "Zatím nemáš finální skladbu" : "Knihovna je zatím prázdná"} text={finalOnly ? "Označ nejlepší MP3 verzi jako finální a zobrazí se zde." : "Označ text jako hotový. Vznikne zde skladba s promptem, textem a prostorem pro MP3 verze."} action={!finalOnly ? <Pressable onPress={() => router.push("/(tabs)/texts" as never)} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Otevřít texty</Text></Pressable> : undefined} />}
  />
  </ScreenContainer>;
}
function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const colors = useColors(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.filter, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}><Text numberOfLines={1} style={[styles.filterText, { color: active ? "#141317" : colors.foreground }]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ content: { paddingTop: 14, paddingBottom: 30 }, search: { height: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 }, filters: { paddingRight: 20, gap: 8 }, filter: { height: 36, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderRadius: 18 }, filterText: { fontSize: 13, fontWeight: "700" }, row: { borderWidth: 1, borderRadius: 19, padding: 10, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, copy: { flex: 1, gap: 5 }, songName: { fontSize: 15, fontWeight: "800" }, songMeta: { fontSize: 12 }, ready: { flexDirection: "row", alignItems: "center", gap: 4 }, readyText: { fontSize: 11, fontWeight: "700" }, login: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, loginText: { color: "#141317", fontWeight: "800" } });
