import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CoverArt, EmptyState, IconButton, LoadingState, PrimaryButton } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function YouTubeExportScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const finalSongs = useMemo(() => {
    const songs = snapshot.data?.songs ?? [];
    const versions = snapshot.data?.versions ?? [];
    const albums = snapshot.data?.albums ?? [];
    return songs.flatMap((song) => {
    const version = versions.find((entry) => entry.songId === song.id && entry.isFinal);
    if (!version) return [];
    return [{ song, version, album: albums.find((entry) => entry.id === song.albumId) }];
    });
  }, [snapshot.data]);
  const copyTitle = async (title: string) => { await Clipboard.setStringAsync(`Temney – ${title}`); };

  if (snapshot.isLoading) return <ScreenContainer><LoadingState label="Připravuji YouTube export…" /></ScreenContainer>;
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content}><View style={styles.topbar}><IconButton label="Zpět" icon="arrow-back" onPress={() => router.back()} /><Text style={[styles.title, { color: colors.foreground }]}>YouTube export</Text><View style={styles.topbarSpace} /></View><View style={[styles.intro, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}45` }]}><MaterialIcons name="verified" size={22} color={colors.success} /><View style={styles.introCopy}><Text style={[styles.introTitle, { color: colors.foreground }]}>Finální skladby připravené k publikaci</Text><Text style={[styles.introText, { color: colors.muted }]}>Stáhnete hotovou MP3 s ID3 tagy, obrázek a zkopírujete název videa.</Text></View></View>{finalSongs.length ? finalSongs.map(({ song, version, album }) => { const cover = song.coverUrl ?? album?.coverUrl; return <View key={song.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.cardHead}><CoverArt uri={cover} title={song.title} size={64} /><View style={styles.cardCopy}><Text numberOfLines={1} style={[styles.songTitle, { color: colors.foreground }]}>{song.title}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{album?.name ?? "Singl"} · {version.label}</Text><Text style={[styles.ready, { color: colors.success }]}>Finální MP3 připravena</Text></View></View><View style={styles.checks}><Check ok label="Finální MP3 s ID3 tagy" colors={colors} /><Check ok={Boolean(cover)} label="Obrázek pro video" colors={colors} /><Check ok={Boolean(song.lyrics)} label="Text uložený u skladby" colors={colors} /></View><View style={styles.actions}><Pressable onPress={() => void Linking.openURL(version.storageUrl)} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="download" size={18} color="#141317" /><Text style={styles.primaryText}>Stáhnout MP3</Text></Pressable><Pressable onPress={() => void copyTitle(song.title)} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="content-copy" size={17} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.primary }]}>Kopírovat název</Text></Pressable>{cover ? <Pressable onPress={() => void Linking.openURL(cover)} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="image" size={17} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.primary }]}>Stáhnout obrázek</Text></Pressable> : null}</View></View>; }) : <EmptyState icon="video-library" title="Zatím nemáš finální skladby" text="V detailu skladby označ nejlepší MP3 verzi jako finální. Tady pak připravíš soubory pro YouTube." action={<PrimaryButton label="Do knihovny" icon="library-music" onPress={() => router.replace("/(tabs)/library" as never)} />} />}</ScrollView></ScreenContainer>;
}

function Check({ ok, label, colors }: { ok: boolean; label: string; colors: ReturnType<typeof useColors> }) { return <View style={styles.check}><MaterialIcons name={ok ? "check-circle" : "radio-button-unchecked"} size={15} color={ok ? colors.success : colors.muted} /><Text style={[styles.checkText, { color: ok ? colors.foreground : colors.muted }]}>{label}</Text></View>; }

const styles = StyleSheet.create({ content: { padding: 20, paddingTop: 14, paddingBottom: 38, gap: 15 }, topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 16, fontWeight: "900" }, topbarSpace: { width: 44 }, intro: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", gap: 10 }, introCopy: { flex: 1, gap: 3 }, introTitle: { fontSize: 14, fontWeight: "900" }, introText: { fontSize: 12, lineHeight: 17 }, card: { borderWidth: 1, borderRadius: 20, padding: 13, gap: 13 }, cardHead: { flexDirection: "row", gap: 11 }, cardCopy: { flex: 1, gap: 4 }, songTitle: { fontSize: 16, fontWeight: "900" }, meta: { fontSize: 12 }, ready: { fontSize: 11, fontWeight: "800" }, checks: { gap: 5 }, check: { flexDirection: "row", gap: 6, alignItems: "center" }, checkText: { fontSize: 12 }, actions: { gap: 8 }, primary: { height: 44, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryText: { color: "#141317", fontWeight: "900", fontSize: 13 }, secondary: { height: 42, borderWidth: 1, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, secondaryText: { fontWeight: "800", fontSize: 12 } });
