import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { CoverArt, EmptyState, IconButton, LoadingState, StudioHeader } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function AlbumsScreen() {
  const colors = useColors();
  const { isAuthenticated, loading } = useAuth();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  if (loading || (isAuthenticated && snapshot.isLoading)) return <ScreenContainer><LoadingState /></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock" title="Alba jsou soukromá" text="Přihlas se a vytvoř své první album v cloudu." action={<Pressable onPress={() => void startOAuthLogin()} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Přihlásit se</Text></Pressable>} /></ScreenContainer>;
  const albums = snapshot.data?.albums ?? [];
  return <ScreenContainer className="px-5"><FlatList data={albums} keyExtractor={(item) => String(item.id)} numColumns={2} columnWrapperStyle={albums.length ? styles.columns : undefined} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} ListHeaderComponent={<StudioHeader eyebrow="Katalog projektu" title="Alba" action={<IconButton label="Nové album" icon="add" onPress={() => router.push("/album/new" as never)} />} />} renderItem={({ item }) => { const documents = snapshot.data?.documents.filter((document) => document.albumId === item.id).length ?? 0; const songs = snapshot.data?.songs.filter((song) => song.albumId === item.id).length ?? 0; return <Pressable onPress={() => router.push(`/(tabs)/texts?album=${item.id}` as never)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}><CoverArt uri={item.coverUrl} title={item.name} size={130} /><Text numberOfLines={2} style={[styles.albumName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.albumMeta, { color: colors.muted }]}>{item.releaseYear ?? "bez roku"} · {documents} textů · {songs} skladeb</Text><View style={styles.open}><Text style={[styles.openText, { color: colors.primary }]}>Otevřít texty</Text><MaterialIcons name="arrow-forward" size={15} color={colors.primary} /></View></Pressable>; }} ListEmptyComponent={<EmptyState icon="album" title="Zatím nemáš žádné album" text="Vytvoř album a uspořádej do něj koncepty, hotové skladby i přebaly." action={<Pressable onPress={() => router.push("/album/new" as never)} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Vytvořit album</Text></Pressable>} />} />
  </ScreenContainer>;
}
const styles = StyleSheet.create({ content: { paddingTop: 14, paddingBottom: 30 }, columns: { gap: 10, marginBottom: 10 }, card: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 21, padding: 10, gap: 10 }, albumName: { fontSize: 15, lineHeight: 19, fontWeight: "800", minHeight: 38 }, albumMeta: { fontSize: 11, lineHeight: 15 }, open: { flexDirection: "row", gap: 4, alignItems: "center" }, openText: { fontSize: 11, fontWeight: "800" }, login: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, loginText: { color: "#141317", fontWeight: "800" } });
