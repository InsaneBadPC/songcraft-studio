import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { IconButton, LoadingState, SectionTitle } from "@/components/studio-ui";
import { RhymeFinder } from "@/components/rhyme-finder";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { assetToBase64 } from "@/lib/file-base64";
import { trpc } from "@/lib/trpc";

type SongForm = { title: string; albumId: number | null; stylePrompt: string; lyrics: string; notes: string; coverStorageKey: string | null; coverUrl: string | null };
const emptyForm: SongForm = { title: "", albumId: null, stylePrompt: "", lyrics: "", notes: "", coverStorageKey: null, coverUrl: null };

export function SongEditor({ songId }: { songId?: number }) {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const song = useMemo(() => snapshot.data?.songs.find((entry) => entry.id === songId), [snapshot.data?.songs, songId]);
  const [form, setForm] = useState<SongForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const upload = trpc.studio.upload.useMutation();
  const create = trpc.studio.createSong.useMutation();
  const update = trpc.studio.updateSong.useMutation();

  useEffect(() => { if (song) setForm({ title: song.title, albumId: song.albumId, stylePrompt: song.stylePrompt ?? "", lyrics: song.lyrics ?? "", notes: song.notes ?? "", coverStorageKey: song.coverStorageKey, coverUrl: song.coverUrl }); }, [song]);
  if (songId && snapshot.isLoading) return <ScreenContainer><LoadingState /></ScreenContainer>;
  if (songId && !song) return <ScreenContainer className="p-6 justify-center"><Text style={[styles.error, { color: colors.muted }]}>Skladba nebyla nalezena.</Text></ScreenContainer>;

  const save = async () => {
    if (!form.title.trim()) { Alert.alert("Chybí název skladby", "Zadej název, pod kterým chceš skladbu vést v katalogu."); return; }
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), albumId: form.albumId, stylePrompt: form.stylePrompt || null, lyrics: form.lyrics || null, notes: form.notes || null, coverStorageKey: form.coverStorageKey, coverUrl: form.coverUrl };
      const savedId = songId ? (await update.mutateAsync({ id: songId, ...payload }), songId) : await create.mutateAsync(payload);
      await utils.studio.snapshot.invalidate();
      router.replace(`/song/${savedId}` as never);
    } catch (error) { Alert.alert("Skladbu se nepodařilo uložit", error instanceof Error ? error.message : "Zkus to znovu."); } finally { setSaving(false); }
  };
  const uploadCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.82, base64: true });
    if (result.canceled) return;
    try { const asset = result.assets[0]; const base64 = await assetToBase64(asset.uri, asset.base64); const uploaded = await upload.mutateAsync({ folder: "covers", fileName: asset.fileName ?? `song-cover-${Date.now()}.jpg`, contentType: asset.mimeType ?? "image/jpeg", base64 }); setForm((current) => ({ ...current, coverStorageKey: uploaded.key, coverUrl: uploaded.url })); } catch (error) { Alert.alert("Obrázek se nepodařilo nahrát", error instanceof Error ? error.message : "Zkus jiný obrázek."); }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.topbar}><IconButton label="Zpět" icon="arrow-back" onPress={() => router.back()} /><Text numberOfLines={1} style={[styles.topbarName, { color: colors.foreground }]}>{songId ? "Upravit skladbu" : "Nová skladba"}</Text><Pressable onPress={() => void save()} style={({ pressed }) => [styles.save, { opacity: saving || pressed ? 0.6 : 1 }]}><Text style={[styles.saveText, { color: colors.primary }]}>{saving ? "Ukládám" : "Uložit"}</Text></Pressable></View>
    <View style={[styles.flow, { backgroundColor: `${colors.primary}13`, borderColor: `${colors.primary}45` }]}><MaterialIcons name="account-tree" size={20} color={colors.primary} /><Text style={[styles.flowText, { color: colors.muted }]}>Tato položka drží pohromadě text, obrázek, MP3 verze, metadata a album.</Text></View>
    <Pressable onPress={() => void uploadCover()} style={({ pressed }) => [styles.cover, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.72 : 1 }]}>{form.coverUrl ? <Image source={{ uri: form.coverUrl }} style={styles.coverImage} /> : <><View style={[styles.coverIcon, { backgroundColor: `${colors.primary}20` }]}><MaterialIcons name="add-photo-alternate" size={25} color={colors.primary} /></View><Text style={[styles.coverTitle, { color: colors.foreground }]}>Přidat obrázek skladby</Text><Text style={[styles.coverText, { color: colors.muted }]}>Použiješ jej pro katalog i jako budoucí obrázek pro YouTube.</Text></>}</Pressable>
    <Field label="Název skladby" value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Např. Noční signál" autoFocus={!songId} colors={colors} />
    <SectionTitle title="Album" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumChips}><AlbumChip active={!form.albumId} label="Bez alba" onPress={() => setForm((current) => ({ ...current, albumId: null }))} />{snapshot.data?.albums.map((album) => <AlbumChip key={album.id} active={form.albumId === album.id} label={album.name} onPress={() => setForm((current) => ({ ...current, albumId: album.id }))} />)}</ScrollView>
    <SectionTitle title="Obsah propojeného textu" />
    <Field label="1. Prompt pro styl" helper="Například žánr, tempo, nálada, nástroje a typ hlasu." value={form.stylePrompt} onChangeText={(stylePrompt) => setForm((current) => ({ ...current, stylePrompt }))} placeholder="Atmosférický pop, 96 BPM, jemný mužský vokál…" multiline colors={colors} />
    <Field label="2. Samotný text písně" value={form.lyrics} onChangeText={(lyrics) => setForm((current) => ({ ...current, lyrics }))} placeholder="[Sloka 1]\n…" multiline tall colors={colors} />
    <RhymeFinder onInsert={(word) => setForm((current) => ({ ...current, lyrics: `${current.lyrics}${current.lyrics && !/\s$/.test(current.lyrics) ? " " : ""}${word}` }))} />
    <Field label="Poznámky" value={form.notes} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} placeholder="Aranž, reference, nápady na klip…" multiline colors={colors} />
    <Pressable onPress={() => void save()} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary, opacity: saving || pressed ? 0.68 : 1 }]}><MaterialIcons name="save" size={20} color="#141317" /><Text style={styles.saveButtonText}>{saving ? "Ukládám skladbu…" : "Uložit položku skladby"}</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

function Field({ label, helper, value, onChangeText, placeholder, multiline, tall, autoFocus, colors }: { label: string; helper?: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; tall?: boolean; autoFocus?: boolean; colors: ReturnType<typeof useColors> }) { return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>{helper ? <Text style={[styles.fieldHelper, { color: colors.muted }]}>{helper}</Text> : null}<TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} autoFocus={autoFocus} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multiline, tall && styles.tall, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /></View>; }
function AlbumChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const colors = useColors(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.albumChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.68 : 1 }]}><Text numberOfLines={1} style={[styles.albumChipText, { color: active ? "#141317" : colors.foreground }]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ content: { padding: 20, paddingTop: 14, paddingBottom: 38, gap: 18 }, topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, topbarName: { flex: 1, fontSize: 15, fontWeight: "800", textAlign: "center" }, save: { minWidth: 49, minHeight: 42, alignItems: "flex-end", justifyContent: "center" }, saveText: { fontSize: 14, fontWeight: "800" }, flow: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row", gap: 9, alignItems: "center" }, flowText: { flex: 1, fontSize: 12, lineHeight: 17 }, cover: { minHeight: 135, borderWidth: 1, borderRadius: 20, padding: 18, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" }, coverImage: { width: "100%", height: 210, borderRadius: 13 }, coverIcon: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center" }, coverTitle: { fontSize: 15, fontWeight: "800" }, coverText: { fontSize: 12, textAlign: "center", lineHeight: 17 }, field: { gap: 7 }, fieldLabel: { fontSize: 15, fontWeight: "800" }, fieldHelper: { fontSize: 12, lineHeight: 17 }, input: { minHeight: 49, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 }, multiline: { minHeight: 116, paddingVertical: 13, lineHeight: 21 }, tall: { minHeight: 255 }, albumChips: { gap: 8, paddingRight: 20 }, albumChip: { borderWidth: 1, height: 37, borderRadius: 20, justifyContent: "center", paddingHorizontal: 14 }, albumChipText: { fontSize: 13, fontWeight: "700" }, saveButton: { minHeight: 53, borderRadius: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, saveButtonText: { color: "#141317", fontSize: 15, fontWeight: "900" }, error: { fontSize: 15, textAlign: "center" } });
