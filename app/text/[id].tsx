import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { IconButton, LoadingState, PrimaryButton, SectionTitle, StatusChip } from "@/components/studio-ui";
import { RhymeFinder } from "@/components/rhyme-finder";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { assetToBase64 } from "@/lib/file-base64";
import { trpc } from "@/lib/trpc";
import { useUndoableText } from "@/lib/use-undoable-text";

type EditorForm = { title: string; albumId: string | null; stylePrompt: string; lyrics: string; notes: string; coverStorageKey: string | null; coverUrl: string | null };
const emptyForm: EditorForm = { title: "", albumId: null, stylePrompt: "", lyrics: "", notes: "", coverStorageKey: null, coverUrl: null };

export default function TextEditorScreen() {
  const colors = useColors();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId === "new" ? null : rawId;
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const document = useMemo(() => snapshot.data?.documents.find((item) => item.id === id), [id, snapshot.data?.documents]);
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const upload = trpc.studio.upload.useMutation();
  const create = trpc.studio.createDocument.useMutation();
  const update = trpc.studio.updateDocument.useMutation();
  const complete = trpc.studio.completeDocument.useMutation();
  const createCoverGeneration = trpc.studio.createCoverGeneration.useMutation();
  const checkCoverGeneration = trpc.studio.checkCoverGeneration.useMutation();
  const [coverGenerating, setCoverGenerating] = useState(false);
  const lyricsHistory = useUndoableText("");
  useEffect(() => { if (document) { setForm({ title: document.title, albumId: document.albumId, stylePrompt: document.stylePrompt ?? "", lyrics: document.lyrics ?? "", notes: document.notes ?? "", coverStorageKey: document.coverStorageKey, coverUrl: document.coverUrl }); lyricsHistory.reset(document.lyrics ?? ""); } }, [document]);
  if (id && snapshot.isLoading) return <ScreenContainer><LoadingState /></ScreenContainer>;

  const save = async () => {
    if (!form.title.trim()) { Alert.alert("Chybí název", "Doplň název skladby nebo konceptu."); return null; }
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), albumId: form.albumId, stylePrompt: form.stylePrompt || null, lyrics: form.lyrics || null, notes: form.notes || null, coverStorageKey: form.coverStorageKey, coverUrl: form.coverUrl };
      const savedId = id ? (await update.mutateAsync({ id, ...payload }), id) : await create.mutateAsync(payload);
      await utils.studio.snapshot.invalidate();
      if (!id) router.replace(`/text/${savedId}` as never);
      return savedId;
    } catch (error) { Alert.alert("Uložení se nezdařilo", error instanceof Error ? error.message : "Zkus to znovu."); return null; } finally { setSaving(false); }
  };
  const uploadCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.92, base64: true });
    if (result.canceled) return;
    try {
      const asset = result.assets[0];
      const base64 = await assetToBase64(asset.uri, asset.base64);
      const uploaded = await upload.mutateAsync({ folder: "covers", fileName: asset.fileName ?? `cover-${Date.now()}.jpg`, contentType: asset.mimeType ?? "image/jpeg", base64 });
      setForm((current) => ({ ...current, coverStorageKey: uploaded.key, coverUrl: uploaded.url }));
    } catch (error) { Alert.alert("Přebal se nepodařilo nahrát", error instanceof Error ? error.message : "Zkus jiný obrázek."); }
  };
  const generateCover = async () => {
    if (!id) { Alert.alert("Nejprve text ulož", "AI vytváří obal z uloženého názvu, promptu a textu. Nejdřív klepni na Uložit."); return; }
    setCoverGenerating(true);
    try {
      const created = await createCoverGeneration.mutateAsync({ entityType: "lyric", entityId: id, format: "youtube_16_9" });
      for (let attempt = 0; attempt < 36; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const status = await checkCoverGeneration.mutateAsync({ entityType: "lyric", entityId: id, jobId: created.jobId, format: "youtube_16_9" });
        if (status.status === "completed") { await utils.studio.snapshot.invalidate(); Alert.alert("Obrázek je připravený", "Nový 16:9 obal byl uložen k textu a použije se i pro YouTube video."); return; }
        if (status.status === "failed") throw new Error(status.error);
      }
      Alert.alert("Obal je stále ve frontě", "Bezplatná AI má nyní delší frontu. Zkus to za chvíli znovu.");
    } catch (error) { Alert.alert("Obrázek se nepodařilo vytvořit", error instanceof Error ? error.message : "Zkus to znovu za chvíli."); } finally { setCoverGenerating(false); }
  };
  const markComplete = async () => { const saved = await save(); if (!saved) return; try { await complete.mutateAsync({ id: saved }); await utils.studio.snapshot.invalidate(); Alert.alert("Skladba je hotová", "Text byl zařazen do knihovny skladeb.", [{ text: "Otevřít knihovnu", onPress: () => router.replace("/(tabs)/library" as never) }]); } catch (error) { Alert.alert("Změna stavu se nezdařila", error instanceof Error ? error.message : "Zkus to znovu."); } };
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets><View style={styles.topbar}><IconButton label="Zpět" icon="arrow-back" onPress={() => router.back()} /><View style={styles.topbarTitle}><Text numberOfLines={1} style={[styles.topbarName, { color: colors.foreground }]}>{id ? "Editor textu" : "Nový text"}</Text>{document ? <StatusChip state={document.status} /> : null}</View><Pressable onPress={() => void save()} style={({ pressed }) => [styles.save, { opacity: saving || pressed ? 0.6 : 1 }]}><Text style={[styles.saveText, { color: colors.primary }]}>{saving ? "Ukládám" : "Uložit"}</Text></Pressable></View>
    <View style={styles.coverBlock}>
    <Pressable onPress={() => void uploadCover()} style={({ pressed }) => [styles.cover, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.72 : 1 }]}>{form.coverUrl ? <Image source={{ uri: form.coverUrl }} style={styles.coverImage} /> : <><View style={[styles.coverIcon, { backgroundColor: `${colors.primary}20` }]}><MaterialIcons name="add-photo-alternate" size={25} color={colors.primary} /></View><Text style={[styles.coverTitle, { color: colors.foreground }]}>Přidat přebal skladby</Text><Text style={[styles.coverText, { color: colors.muted }]}>Použiješ ho v katalogu i při přípravě obrázku pro YouTube.</Text></>}</Pressable>
    <Pressable onPress={() => void generateCover()} disabled={coverGenerating} style={({ pressed }) => [styles.generateCover, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: coverGenerating || pressed ? 0.62 : 1 }]}><MaterialIcons name={coverGenerating ? "hourglass-top" : "auto-awesome"} size={19} color={colors.primary} /><View style={styles.generateCopy}><Text style={[styles.generateTitle, { color: colors.primary }]}>{coverGenerating ? "Bezplatná AI vytváří 16:9 obal…" : "Vygenerovat obrázek skladby 16:9"}</Text><Text style={[styles.generateText, { color: colors.muted }]}>{id ? "Vytvoří široký obal z názvu, stylu a textu — ideální pro YouTube." : "Nejdřív text ulož, pak můžeš vytvořit obal."}</Text></View></Pressable>
    </View>
    <Field label="Název" value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Např. Noční signál" autoFocus={!id} colors={colors} />
    <SectionTitle title="Zařazení do alba" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumChips}><AlbumChip active={!form.albumId} label="Bez alba" onPress={() => setForm((current) => ({ ...current, albumId: null }))} />{snapshot.data?.albums.map((album) => <AlbumChip key={album.id} active={form.albumId === album.id} label={album.name} onPress={() => setForm((current) => ({ ...current, albumId: album.id }))} />)}</ScrollView>
    <Field label="Prompt stylu pro hudební generátor" value={form.stylePrompt} onChangeText={(stylePrompt) => setForm((current) => ({ ...current, stylePrompt }))} placeholder="Žánr, tempo, nálada, nástroje, hlas…" multiline colors={colors} helper="V hotové skladbě jej zkopíruješ jedním klepnutím." />
    <View style={styles.lyricsHead}><Text style={[styles.lyricsLabel, { color: colors.foreground }]}>Text písně</Text><View style={styles.historyRow}><Pressable onPress={lyricsHistory.undo} disabled={!lyricsHistory.canUndo} style={({ pressed }) => [styles.historyButton, { borderColor: colors.border, backgroundColor: colors.surface, opacity: !lyricsHistory.canUndo || pressed ? 0.4 : 1 }]}><MaterialIcons name="undo" size={18} color={colors.primary} /><Text style={[styles.historyButtonText, { color: colors.primary }]}>Zpět</Text></Pressable><Pressable onPress={lyricsHistory.redo} disabled={!lyricsHistory.canRedo} style={({ pressed }) => [styles.historyButton, { borderColor: colors.border, backgroundColor: colors.surface, opacity: !lyricsHistory.canRedo || pressed ? 0.4 : 1 }]}><MaterialIcons name="redo" size={18} color={colors.primary} /><Text style={[styles.historyButtonText, { color: colors.primary }]}>Vpřed</Text></Pressable></View></View>
    <TextInput value={lyricsHistory.value} onChangeText={(text) => { lyricsHistory.change(text); setForm((current) => ({ ...current, lyrics: text })); }} placeholder="[Verse]\n…" placeholderTextColor={colors.muted} multiline textAlignVertical="top" disableFullscreenUI style={[styles.input, styles.tall, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
    <Field label="Poznámky k produkci" value={form.notes} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} placeholder="Aranž, reference, nápady na klip…" multiline colors={colors} />
    <View style={[styles.completeBox, { backgroundColor: `${colors.success}16`, borderColor: `${colors.success}55` }]}><MaterialIcons name="check-circle" size={23} color={colors.success} /><View style={styles.completeCopy}><Text style={[styles.completeTitle, { color: colors.foreground }]}>Připraveno pro knihovnu?</Text><Text style={[styles.completeText, { color: colors.muted }]}>Označením zůstane dokument zachovaný a vytvoří se katalogová skladba.</Text></View></View><PrimaryButton label={document?.status === "complete" ? "Aktualizovat hotovou skladbu" : "Označit jako hotové"} icon="task-alt" onPress={() => void markComplete()} disabled={saving || complete.isPending} />
  </ScrollView><RhymeFinder variant="floating" onInsert={(word) => setForm((current) => ({ ...current, lyrics: `${current.lyrics}${current.lyrics && !/\s$/.test(current.lyrics) ? " " : ""}${word}` }))} /></ScreenContainer>;
}
const Field = memo(function Field({ label, helper, value, onChangeText, placeholder, multiline, tall, autoFocus, colors }: { label: string; helper?: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; tall?: boolean; autoFocus?: boolean; colors: ReturnType<typeof useColors> }) { return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>{helper ? <Text style={[styles.fieldHelper, { color: colors.muted }]}>{helper}</Text> : null}<TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} autoFocus={autoFocus} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multiline, tall && styles.tall, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /></View>; })
function AlbumChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const colors = useColors(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.albumChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.68 : 1 }]}><Text numberOfLines={1} style={[styles.albumChipText, { color: active ? "#141317" : colors.foreground }]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ content: { padding: 20, paddingTop: 14, paddingBottom: 38, gap: 18 }, topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, topbarTitle: { flex: 1, alignItems: "center", gap: 4 }, topbarName: { fontSize: 15, fontWeight: "800" }, save: { minWidth: 49, minHeight: 42, alignItems: "flex-end", justifyContent: "center" }, saveText: { fontSize: 14, fontWeight: "800" }, coverBlock: { gap: 9 }, lyricsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }, lyricsLabel: { fontSize: 15, fontWeight: "800" }, historyRow: { flexDirection: "row", gap: 7 }, historyButton: { height: 34, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 5 }, historyButtonText: { fontSize: 12.5, fontWeight: "900" }, generateCover: { minHeight: 62, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }, generateCopy: { flex: 1, gap: 2 }, generateTitle: { fontSize: 14, fontWeight: "900" }, generateText: { fontSize: 11, lineHeight: 15 }, cover: { minHeight: 135, borderWidth: 1, borderRadius: 20, padding: 18, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" }, coverImage: { width: "100%", height: 210, borderRadius: 13 }, coverIcon: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center" }, coverTitle: { fontSize: 15, fontWeight: "800" }, coverText: { fontSize: 12, textAlign: "center", lineHeight: 17 }, field: { gap: 7 }, fieldLabel: { fontSize: 15, fontWeight: "800" }, fieldHelper: { fontSize: 12, lineHeight: 17 }, input: { minHeight: 49, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 }, multiline: { minHeight: 116, paddingVertical: 13, lineHeight: 21 }, tall: { minHeight: 255 }, albumChips: { gap: 8, paddingRight: 20 }, albumChip: { borderWidth: 1, height: 37, borderRadius: 20, justifyContent: "center", paddingHorizontal: 14 }, albumChipText: { fontSize: 13, fontWeight: "700" }, completeBox: { flexDirection: "row", gap: 11, padding: 14, borderRadius: 18, borderWidth: 1 }, completeCopy: { flex: 1, gap: 3 }, completeTitle: { fontSize: 14, fontWeight: "800" }, completeText: { fontSize: 12, lineHeight: 17 } });
