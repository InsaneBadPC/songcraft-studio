import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CoverArt, EmptyState, IconButton, LoadingState, PrimaryButton } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { downloadOrShareFile, saveFinishedMp3 } from "@/lib/download-and-share";
import { trpc } from "@/lib/trpc";
import { createAndShareYoutubeVideo } from "@/lib/youtube-video";

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
  const [renderingSongId, setRenderingSongId] = useState<string | null>(null);
  const copyTitle = async (title: string) => { await Clipboard.setStringAsync(`Temney – ${title}`); };
  const createVideo = async (song: { id: string; title: string }, version: { taggedStorageUrl?: string | null; storageUrl: string }, cover?: string | null) => {
    if (!cover) { Alert.alert("Chybí obrázek", "Nejdřív ke skladbě přidej nebo vygeneruj cover. Video pak použije právě tento statický obrázek."); return; }
    setRenderingSongId(song.id);
    try { await createAndShareYoutubeVideo({ audioUrl: version.taggedStorageUrl ?? version.storageUrl, coverUrl: cover, title: `Temney-${song.title}` }); }
    catch (error) { Alert.alert("Video se nepodařilo vytvořit", error instanceof Error ? error.message : "Zkus to znovu za chvíli."); }
    finally { setRenderingSongId(null); }
  };

  if (snapshot.isLoading) return <ScreenContainer><LoadingState label="Připravuji YouTube export…" /></ScreenContainer>;
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content}><View style={styles.topbar}><IconButton label="Zpět" icon="arrow-back" onPress={() => router.back()} /><Text style={[styles.title, { color: colors.foreground }]}>YouTube export</Text><View style={styles.topbarSpace} /></View><View style={[styles.intro, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}45` }]}><MaterialIcons name="verified" size={22} color={colors.success} /><View style={styles.introCopy}><Text style={[styles.introTitle, { color: colors.foreground }]}>Finální skladby připravené k publikaci</Text><Text style={[styles.introText, { color: colors.muted }]}>V Android APK vytvoříš z finální MP3 a coveru Full HD MP4 připravené k nahrání na YouTube.</Text></View></View>{finalSongs.length ? finalSongs.map(({ song, version, album }) => { const cover = song.coverUrl ?? album?.coverUrl; const rendering = renderingSongId === song.id; return <View key={song.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.cardHead}><CoverArt uri={cover} title={song.title} size={64} /><View style={styles.cardCopy}><Text numberOfLines={1} style={[styles.songTitle, { color: colors.foreground }]}>{song.title}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{album?.name ?? "Singl"} · {version.label}</Text><Text style={[styles.ready, { color: colors.success }]}>Finální MP3 připravena</Text></View></View><View style={styles.checks}><Check ok label="Finální MP3 s ID3 tagy" colors={colors} /><Check ok={Boolean(cover)} label="Obrázek pro video" colors={colors} /><Check ok={Boolean(song.lyrics)} label="Text uložený u skladby" colors={colors} /></View><View style={styles.actions}>{cover ? <Pressable disabled={rendering} onPress={() => void createVideo(song, version, cover)} style={({ pressed }) => [styles.video, { backgroundColor: colors.success, opacity: rendering || pressed ? 0.62 : 1 }]}><MaterialIcons name={rendering ? "hourglass-top" : "movie-creation"} size={19} color="#141317" /><Text style={styles.videoText}>{rendering ? "Vytvářím MP4 v telefonu…" : "Vytvořit video pro YouTube"}</Text></Pressable> : null}<Pressable onPress={() => void saveFinishedMp3(version.taggedStorageUrl ?? version.storageUrl, version.originalFileName)} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="download" size={18} color="#141317" /><Text style={styles.primaryText}>Uložit MP3 do telefonu</Text></Pressable><Pressable onPress={() => void copyTitle(song.title)} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="content-copy" size={17} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.primary }]}>Kopírovat název</Text></Pressable>{cover ? <Pressable onPress={() => void downloadOrShareFile(cover, `${song.title}-obal.jpg`, "image/jpeg", "Uložit nebo sdílet obrázek skladby")} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="image" size={17} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.primary }]}>Uložit obrázek</Text></Pressable> : null}</View></View>; }) : <EmptyState icon="video-library" title="Zatím nemáš finální skladby" text="V detailu skladby označ nejlepší MP3 verzi jako finální. Tady pak vytvoříš i statické Full HD video." action={<PrimaryButton label="Do knihovny" icon="library-music" onPress={() => router.replace("/(tabs)/library" as never)} />} />}</ScrollView></ScreenContainer>;
}

function Check({ ok, label, colors }: { ok: boolean; label: string; colors: ReturnType<typeof useColors> }) { return <View style={styles.check}><MaterialIcons name={ok ? "check-circle" : "radio-button-unchecked"} size={15} color={ok ? colors.success : colors.muted} /><Text style={[styles.checkText, { color: ok ? colors.foreground : colors.muted }]}>{label}</Text></View>; }

const styles = StyleSheet.create({ content: { padding: 20, paddingTop: 14, paddingBottom: 38, gap: 15 }, topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 16, fontWeight: "900" }, topbarSpace: { width: 44 }, intro: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", gap: 10 }, introCopy: { flex: 1, gap: 3 }, introTitle: { fontSize: 14, fontWeight: "900" }, introText: { fontSize: 12, lineHeight: 17 }, card: { borderWidth: 1, borderRadius: 20, padding: 13, gap: 13 }, cardHead: { flexDirection: "row", gap: 11 }, cardCopy: { flex: 1, gap: 4 }, songTitle: { fontSize: 16, fontWeight: "900" }, meta: { fontSize: 12 }, ready: { fontSize: 11, fontWeight: "800" }, checks: { gap: 5 }, check: { flexDirection: "row", gap: 6, alignItems: "center" }, checkText: { fontSize: 12 }, actions: { gap: 8 }, video: { height: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, videoText: { color: "#141317", fontWeight: "900", fontSize: 13 }, primary: { height: 44, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryText: { color: "#141317", fontWeight: "900", fontSize: 13 }, secondary: { height: 42, borderWidth: 1, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, secondaryText: { fontWeight: "800", fontSize: 12 } });
