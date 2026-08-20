import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CoverArt, EmptyState, IconButton, LoadingState, PrimaryButton, SectionTitle, formatFileSize } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { VersionAudioPlayer } from "@/components/version-audio-player";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { assetToBase64 } from "@/lib/file-base64";
import { trpc } from "@/lib/trpc";

export default function SongDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const songId = Number(id);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [versionOrder, setVersionOrder] = useState<"rating" | "newest">("rating");
  const upload = trpc.studio.upload.useMutation();
  const createVersion = trpc.studio.createVersion.useMutation();

  const song = snapshot.data?.songs.find((entry) => entry.id === songId);
  const document = snapshot.data?.documents.find((entry) => entry.id === song?.sourceDocumentId);
  const album = snapshot.data?.albums.find((entry) => entry.id === song?.albumId);
  const versions = useMemo(() => snapshot.data?.versions.filter((entry) => entry.songId === songId) ?? [], [snapshot.data?.versions, songId]);
  const sortedVersions = useMemo(() => [...versions].sort((left, right) => versionOrder === "rating" ? right.rating - left.rating || Number(right.isFinal) - Number(left.isFinal) || Number(right.isPrimary) - Number(left.isPrimary) || right.id - left.id : right.id - left.id), [versionOrder, versions]);

  if (snapshot.isLoading) return <ScreenContainer><LoadingState label="Načítám skladbu…" /></ScreenContainer>;
  if (!song || !document) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="music-off" title="Skladba nebyla nalezena" text="Vrať se do knihovny a zkus otevřít položku znovu." action={<PrimaryButton label="Do knihovny" icon="library-music" onPress={() => router.replace("/(tabs)/library" as never)} />} /></ScreenContainer>;

  const copyText = async (content: string, label: string) => {
    if (!content.trim()) return;
    try {
      await Clipboard.setStringAsync(content);
      Alert.alert("Zkopírováno", `${label} je připravený ve schránce.`);
    } catch {
      Alert.alert("Kopírování se nezdařilo", "V prohlížeči povol přístup ke schránce a zkus to znovu.");
    }
  };

  const addMp3 = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["audio/mpeg", "audio/mp3"], copyToCacheDirectory: true });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (asset.size && asset.size > 25 * 1024 * 1024) {
      Alert.alert("Soubor je příliš velký", "Jedna MP3 verze může mít pro bezpečné nahrání nejvýše 25 MB.");
      return;
    }
    try {
      const base64 = await assetToBase64(asset.uri, asset.base64);
      const uploaded = await upload.mutateAsync({
        folder: "audio",
        fileName: asset.name,
        contentType: asset.mimeType ?? "audio/mpeg",
        base64,
      });
      await createVersion.mutateAsync({
        songId,
        label: asset.name.replace(/\.mp3$/i, ""),
        originalFileName: uploaded.originalFileName,
        storageKey: uploaded.key,
        storageUrl: uploaded.url,
        mimeType: uploaded.mimeType,
        byteSize: uploaded.byteSize,
        id3Title: song.title,
        id3Artist: null,
        id3Album: album?.name ?? null,
        id3TrackNumber: null,
        id3Year: album?.releaseYear ? String(album.releaseYear) : null,
        id3Genre: null,
        id3Comment: null,
        rating: 0,
        isPrimary: versions.length === 0,
      });
      await utils.studio.snapshot.invalidate();
    } catch (error) {
      Alert.alert("Nahrání MP3 se nezdařilo", error instanceof Error ? error.message : "Zkus soubor nahrát znovu.");
    }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.topbar}><IconButton label="Zpět" icon="arrow-back" onPress={() => router.back()} /><Text numberOfLines={1} style={[styles.topbarTitle, { color: colors.foreground }]}>Detail skladby</Text><View style={styles.topbarSpacer} /></View>
    <View style={[styles.songHero, { backgroundColor: colors.surface, borderColor: colors.border }]}><CoverArt uri={document.coverUrl ?? album?.coverUrl} title={song.title} size={92} /><View style={styles.songHeroCopy}><Text style={[styles.songName, { color: colors.foreground }]}>{song.title}</Text><Text style={[styles.songAlbum, { color: colors.muted }]}>{album?.name ?? "Bez alba"}</Text><View style={styles.complete}><MaterialIcons name="check-circle" size={15} color={colors.success} /><Text style={[styles.completeText, { color: colors.success }]}>hotový text</Text></View></View></View>
    <ContentCard icon="auto-awesome" title="Prompt stylu" text={document.stylePrompt || "Prompt zatím nebyl vyplněn."} actionLabel="Kopírovat prompt" disabled={!document.stylePrompt} onAction={() => void copyText(document.stylePrompt ?? "", "Prompt")} />
    <ContentCard icon="format-align-left" title="Text písně" text={document.lyrics || "Text písně zatím nebyl vyplněn."} actionLabel="Kopírovat text" disabled={!document.lyrics} onAction={() => void copyText(document.lyrics ?? "", "Text písně")} />
    <VersionAudioPlayer versions={sortedVersions} />
    <SectionTitle title={`Přiřazené MP3 (${versions.length})`} right={<Pressable onPress={() => void addMp3()}><Text style={[styles.addLink, { color: colors.primary }]}>{upload.isPending ? "Nahrávám…" : "Přidat MP3"}</Text></Pressable>} />
    {versions.length ? <Pressable onPress={() => setVersionOrder((current) => current === "rating" ? "newest" : "rating")} style={({ pressed }) => [styles.sortControl, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name={versionOrder === "rating" ? "star" : "schedule"} size={17} color={colors.primary} /><Text style={[styles.sortControlText, { color: colors.foreground }]}>{versionOrder === "rating" ? "Řazení: nejlepší hodnocení" : "Řazení: nejnovější verze"}</Text><MaterialIcons name="swap-vert" size={18} color={colors.muted} /></Pressable> : null}
    {sortedVersions.length ? sortedVersions.map((version) => <Pressable key={version.id} onPress={() => setSelectedVersion(version.id)} style={({ pressed }) => [styles.versionRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.versionIcon, { backgroundColor: `${colors.primary}20` }]}><MaterialIcons name={version.isFinal ? "verified" : version.isPrimary ? "star" : "music-note"} size={21} color={version.isFinal ? colors.success : colors.primary} /></View><View style={styles.versionCopy}><View style={styles.versionTitleRow}><Text numberOfLines={1} style={[styles.versionLabel, { color: colors.foreground }]}>{version.label}</Text><View style={styles.statusBadges}>{version.isPrimary ? <Text style={[styles.mainBadge, { color: colors.primary }]}>HLAVNÍ</Text> : null}{version.isFinal ? <Text style={[styles.finalBadge, { color: colors.success }]}>FINÁLNÍ</Text> : null}</View></View><View style={styles.ratingLine}><RatingStars rating={version.rating} /><Text style={[styles.versionFile, { color: colors.muted }]}>{version.originalFileName} · {formatFileSize(version.byteSize)}</Text></View></View><MaterialIcons name="edit" size={19} color={colors.muted} /></Pressable>) : <EmptyState icon="audio-file" title="Zatím žádná zvuková verze" text="Přidej MP3 z telefonu nebo počítače. Ke každé skladbě můžeš vést více verzí." action={<PrimaryButton label="Přidat první MP3" icon="upload-file" onPress={() => void addMp3()} />} />}
  </ScrollView><VersionEditor id={selectedVersion} onClose={() => setSelectedVersion(null)} /></ScreenContainer>;
}

function ContentCard({ icon, title, text, actionLabel, disabled, onAction }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string; actionLabel: string; disabled: boolean; onAction: () => void }) {
  const colors = useColors();
  return <View style={[styles.contentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.cardTitle}><View style={[styles.cardIcon, { backgroundColor: `${colors.primary}1E` }]}><MaterialIcons name={icon} size={18} color={colors.primary} /></View><Text style={[styles.cardTitleText, { color: colors.foreground }]}>{title}</Text></View><Text numberOfLines={5} style={[styles.cardText, { color: colors.muted }]}>{text}</Text><Pressable disabled={disabled} onPress={onAction} style={({ pressed }) => [styles.copyButton, { borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}><MaterialIcons name="content-copy" size={16} color={colors.primary} /><Text style={[styles.copyButtonText, { color: colors.primary }]}>{actionLabel}</Text></Pressable></View>;
}

function VersionEditor({ id, onClose }: { id: number | null; onClose: () => void }) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const snapshot = trpc.studio.snapshot.useQuery();
  const version = snapshot.data?.versions.find((entry) => entry.id === id);
  const update = trpc.studio.updateVersion.useMutation();
  const setPrimary = trpc.studio.setPrimaryVersion.useMutation();
  const setFinal = trpc.studio.setFinalVersion.useMutation();
  const remove = trpc.studio.deleteVersion.useMutation();
  const exportTagged = trpc.studio.exportTaggedCopy.useMutation();
  const [form, setForm] = useState({ label: "", title: "", artist: "", album: "", track: "", year: "", genre: "", comment: "", rating: 0 });

  useEffect(() => {
    if (version) setForm({ label: version.label, title: version.id3Title ?? "", artist: version.id3Artist ?? "", album: version.id3Album ?? "", track: version.id3TrackNumber ?? "", year: version.id3Year ?? "", genre: version.id3Genre ?? "", comment: version.id3Comment ?? "", rating: version.rating });
  }, [version]);
  if (!version || id === null) return null;

  const payload = () => ({ id: version.id, label: form.label.trim() || version.label, id3Title: form.title || null, id3Artist: form.artist || null, id3Album: form.album || null, id3TrackNumber: form.track || null, id3Year: form.year || null, id3Genre: form.genre || null, id3Comment: form.comment || null, rating: form.rating });
  const save = async () => { try { await update.mutateAsync(payload()); await utils.studio.snapshot.invalidate(); onClose(); } catch (error) { Alert.alert("Metadata se nepodařilo uložit", error instanceof Error ? error.message : "Zkus to znovu."); } };
  const makePrimary = async () => { try { await update.mutateAsync(payload()); await setPrimary.mutateAsync({ id: version.id }); await utils.studio.snapshot.invalidate(); } catch { Alert.alert("Změna hlavní verze se nezdařila", "Zkus to znovu."); } };
  const makeFinal = () => Alert.alert("Označit jako finální verzi?", "Tato verze bude také hlavní. Dosavadní hlavní nebo finální označení ostatních verzí se zruší.", [{ text: "Zrušit", style: "cancel" }, { text: "Označit jako finální", onPress: async () => { try { await update.mutateAsync(payload()); await setFinal.mutateAsync({ id: version.id }); await utils.studio.snapshot.invalidate(); } catch { Alert.alert("Změna finální verze se nezdařila", "Zkus to znovu."); } } }]);
  const tagged = async () => { try { await update.mutateAsync(payload()); const result = await exportTagged.mutateAsync({ id: version.id }); await utils.studio.snapshot.invalidate(); Alert.alert("Vznikla nová MP3 kopie", "Originál zůstal beze změny. Nová kopie obsahuje vyplněné ID3 tagy.", [{ text: "Později" }, { text: "Otevřít kopii", onPress: () => void Linking.openURL(result.url) }]); } catch (error) { Alert.alert("Export se nezdařil", error instanceof Error ? error.message : "Zkontroluj soubor a zkus to znovu."); } };
  const confirmDelete = () => Alert.alert("Odebrat tuto verzi?", "Z katalogu se odebere jen tato MP3 položka. Originál zůstane v uložené historii.", [{ text: "Zrušit", style: "cancel" }, { text: "Odebrat", style: "destructive", onPress: async () => { await remove.mutateAsync({ id: version.id }); await utils.studio.snapshot.invalidate(); onClose(); } }]);

  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalShade}><View style={[styles.sheet, { backgroundColor: colors.background }]}><View style={[styles.handle, { backgroundColor: colors.border }]} /><View style={styles.sheetTop}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Verze MP3</Text><Text numberOfLines={1} style={[styles.sheetFile, { color: colors.muted }]}>{version.originalFileName}</Text></View><IconButton icon="close" label="Zavřít" onPress={onClose} /></View><ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}><Field label="Označení verze" value={form.label} onChangeText={(label) => setForm((current) => ({ ...current, label }))} colors={colors} /><View style={styles.ratingEditor}><View><Text style={[styles.sheetLabel, { color: colors.foreground }]}>Hodnocení verze</Text><Text style={[styles.ratingHint, { color: colors.muted }]}>{form.rating ? `${form.rating} z 5 hvězd` : "Zatím nehodnoceno"}</Text></View><RatingStars rating={form.rating} interactive onRate={(rating) => setForm((current) => ({ ...current, rating }))} /></View><Text style={[styles.metaHeading, { color: colors.foreground }]}>ID3 metadata</Text><Text style={[styles.metaDescription, { color: colors.muted }]}>Uprav metadata; export vytvoří novou MP3 kopii a originál nezmění.</Text><Field label="Název skladby" value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} colors={colors} /><Field label="Interpret" value={form.artist} placeholder="Jméno interpreta" onChangeText={(artist) => setForm((current) => ({ ...current, artist }))} colors={colors} /><Field label="Album" value={form.album} onChangeText={(album) => setForm((current) => ({ ...current, album }))} colors={colors} /><View style={styles.pair}><View style={styles.pairChild}><Field label="Číslo stopy" value={form.track} placeholder="01" onChangeText={(track) => setForm((current) => ({ ...current, track }))} colors={colors} /></View><View style={styles.pairChild}><Field label="Rok" value={form.year} placeholder="2026" onChangeText={(year) => setForm((current) => ({ ...current, year }))} colors={colors} /></View></View><Field label="Žánr" value={form.genre} placeholder="Např. pop, rock, ambient" onChangeText={(genre) => setForm((current) => ({ ...current, genre }))} colors={colors} /><Field label="Komentář" value={form.comment} placeholder="Poznámka k verzi" multiline onChangeText={(comment) => setForm((current) => ({ ...current, comment }))} colors={colors} /><PrimaryButton label={update.isPending ? "Ukládám metadata" : "Uložit metadata"} icon="save" onPress={() => void save()} disabled={update.isPending} /><Pressable onPress={() => void makePrimary()} style={({ pressed }) => [styles.outlineAction, { borderColor: colors.border, opacity: setPrimary.isPending || pressed ? 0.65 : 1 }]}><MaterialIcons name="star" size={19} color={colors.primary} /><Text style={[styles.outlineActionText, { color: colors.primary }]}>{version.isPrimary ? "Toto je hlavní verze" : "Nastavit jako hlavní verzi"}</Text></Pressable><Pressable onPress={makeFinal} style={({ pressed }) => [styles.outlineAction, { borderColor: version.isFinal ? colors.success : colors.border, opacity: setFinal.isPending || pressed ? 0.65 : 1 }]}><MaterialIcons name="verified" size={19} color={colors.success} /><Text style={[styles.outlineActionText, { color: colors.success }]}>{version.isFinal ? "Toto je finální verze" : "Označit jako finální verzi"}</Text></Pressable><Pressable onPress={() => void tagged()} style={({ pressed }) => [styles.outlineAction, { borderColor: colors.border, opacity: exportTagged.isPending || pressed ? 0.65 : 1 }]}><MaterialIcons name="drive-file-rename-outline" size={19} color={colors.primary} /><Text style={[styles.outlineActionText, { color: colors.primary }]}>{exportTagged.isPending ? "Vytvářím kopii…" : "Exportovat MP3 s ID3 tagy"}</Text></Pressable><Pressable onPress={confirmDelete} style={({ pressed }) => [styles.deleteAction, { opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="delete-outline" size={19} color={colors.error} /><Text style={[styles.deleteText, { color: colors.error }]}>Odebrat verzi z katalogu</Text></Pressable></ScrollView></View></View></Modal>;
}

function Field({ label, value, onChangeText, placeholder, multiline, colors }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.sheetField}><Text style={[styles.sheetLabel, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[styles.sheetInput, multiline && styles.sheetMultiline, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /></View>;
}

function RatingStars({ rating, interactive = false, onRate }: { rating: number; interactive?: boolean; onRate?: (rating: number) => void }) { const colors = useColors(); return <View style={styles.stars}>{[1, 2, 3, 4, 5].map((value) => interactive ? <Pressable key={value} onPress={() => onRate?.(rating === value ? 0 : value)} hitSlop={6}><MaterialIcons name={value <= rating ? "star" : "star-border"} size={24} color={value <= rating ? colors.warning : colors.border} /></Pressable> : <MaterialIcons key={value} name={value <= rating ? "star" : "star-border"} size={14} color={value <= rating ? colors.warning : colors.border} />)}</View>; }

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 14, paddingBottom: 38, gap: 15 }, topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, topbarTitle: { fontSize: 16, fontWeight: "800" }, topbarSpacer: { width: 44 }, songHero: { borderWidth: 1, borderRadius: 22, padding: 13, flexDirection: "row", alignItems: "center", gap: 14 }, songHeroCopy: { flex: 1, gap: 5 }, songName: { fontSize: 20, lineHeight: 25, fontWeight: "900" }, songAlbum: { fontSize: 13 }, complete: { flexDirection: "row", gap: 4, alignItems: "center" }, completeText: { fontSize: 11, fontWeight: "800" }, contentCard: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 11 }, cardTitle: { flexDirection: "row", alignItems: "center", gap: 9 }, cardIcon: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center" }, cardTitleText: { fontSize: 16, fontWeight: "800" }, cardText: { fontSize: 13, lineHeight: 19 }, copyButton: { alignSelf: "flex-start", height: 36, borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, flexDirection: "row", gap: 6, alignItems: "center" }, copyButtonText: { fontSize: 12, fontWeight: "800" }, addLink: { fontSize: 13, fontWeight: "800" }, sortControl: { minHeight: 39, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, marginTop: -7 }, sortControlText: { flex: 1, fontSize: 12, fontWeight: "800" }, versionRow: { borderWidth: 1, borderRadius: 18, minHeight: 73, padding: 11, flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 }, versionIcon: { height: 42, width: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, versionCopy: { flex: 1, gap: 4 }, versionTitleRow: { flexDirection: "row", gap: 6, alignItems: "center" }, versionLabel: { flex: 1, fontSize: 14, fontWeight: "800" }, versionFile: { fontSize: 11, flex: 1 }, ratingLine: { flexDirection: "row", alignItems: "center", gap: 7 }, stars: { flexDirection: "row", alignItems: "center", gap: 1 }, statusBadges: { flexDirection: "row", alignItems: "center", gap: 5 }, mainBadge: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 }, finalBadge: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 }, ratingEditor: { minHeight: 51, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 1 }, ratingHint: { fontSize: 11, marginTop: 2 }, modalShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" }, sheet: { maxHeight: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 9 }, handle: { height: 4, width: 40, borderRadius: 3, alignSelf: "center", marginBottom: 12 }, sheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12 }, sheetTitle: { fontSize: 19, fontWeight: "900" }, sheetFile: { maxWidth: 240, fontSize: 12, marginTop: 2 }, sheetContent: { padding: 20, paddingTop: 5, paddingBottom: 40, gap: 14 }, metaHeading: { fontSize: 16, fontWeight: "900", marginTop: 4 }, metaDescription: { fontSize: 12, lineHeight: 17, marginTop: -9 }, sheetField: { gap: 6 }, sheetLabel: { fontSize: 13, fontWeight: "800" }, sheetInput: { minHeight: 45, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 }, sheetMultiline: { minHeight: 88, paddingVertical: 11, lineHeight: 19 }, pair: { flexDirection: "row", gap: 10 }, pairChild: { flex: 1 }, outlineAction: { height: 49, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, outlineActionText: { fontSize: 13, fontWeight: "800" }, deleteAction: { height: 42, borderRadius: 13, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", marginTop: 2 }, deleteText: { fontSize: 13, fontWeight: "800" },
});
