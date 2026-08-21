import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { assetToBase64 } from "@/lib/file-base64";
import { annotateSongSections, cleanImportedText } from "@/lib/text-import";
import { trpc } from "@/lib/trpc";

export function TextImporter() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const createDocument = trpc.studio.createDocument.useMutation();
  const importDocx = trpc.studio.importDocx.useMutation();
  const importGoogleDocument = trpc.studio.importGoogleDocument.useMutation();
  const [visible, setVisible] = useState(false);
  const [googleUrl, setGoogleUrl] = useState("");
  const [googleTitle, setGoogleTitle] = useState("");
  const pending = createDocument.isPending || importDocx.isPending || importGoogleDocument.isPending;

  const finish = async (id: string) => { await utils.studio.snapshot.invalidate(); setVisible(false); router.push(`/text/${id}` as never); };
  const readFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/markdown", "text/html", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    try {
      const createdIds: string[] = [];
      for (const asset of result.assets) {
        if (/\.docx$/i.test(asset.name)) {
          const base64 = await assetToBase64(asset.uri, asset.base64);
          createdIds.push(await importDocx.mutateAsync({ fileName: asset.name, base64 }));
          continue;
        }
        if (!/\.(txt|md|markdown|html?|csv)$/i.test(asset.name)) throw new Error(`Soubor „${asset.name}“ není TXT, Markdown, HTML, CSV ani DOCX.`);
        const raw = Platform.OS === "web" ? await fetch(asset.uri).then((response) => response.text()) : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        const lyrics = annotateSongSections(cleanImportedText(raw, asset.name));
        if (!lyrics) throw new Error(`Soubor „${asset.name}“ je prázdný.`);
        const title = asset.name.replace(/\.[^.]+$/, "") || "Importovaný text";
        createdIds.push(await createDocument.mutateAsync({ title, albumId: null, stylePrompt: null, lyrics, notes: `Importováno ze souboru ${asset.name}`, coverStorageKey: null, coverUrl: null }));
      }
      if (!createdIds.length) return;
      await utils.studio.snapshot.invalidate();
      setVisible(false);
      if (createdIds.length === 1) router.push(`/text/${createdIds[0]}` as never);
      else Alert.alert("Import dokončen", `Bylo vytvořeno ${createdIds.length} nových textů. Najdeš je v katalogu Texty.`);
    } catch (error) { Alert.alert("Import se nezdařil", error instanceof Error ? error.message : "Zkus jiný soubor."); }
  };
  const importGoogle = async () => {
    if (!googleUrl.trim() || !googleTitle.trim()) { Alert.alert("Doplň odkaz a název", "Vlož odkaz na Google Dokument a název, pod kterým jej chceš uložit."); return; }
    try { const id = await importGoogleDocument.mutateAsync({ url: googleUrl.trim(), title: googleTitle.trim() }); await finish(id); } catch (error) { Alert.alert("Google Dokument se nepodařilo importovat", error instanceof Error ? error.message : "Ověř, že je dokument sdílený pro každého s odkazem."); }
  };

  return <><Pressable onPress={() => setVisible(true)} style={({ pressed }) => [styles.trigger, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="file-download" size={20} color={colors.primary} /><Text style={[styles.triggerText, { color: colors.foreground }]}>Importovat</Text></Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}><View style={styles.shade}><View style={[styles.sheet, { backgroundColor: colors.background }]}><View style={[styles.handle, { backgroundColor: colors.border }]} /><View style={styles.top}><View><Text style={[styles.title, { color: colors.foreground }]}>Importovat text</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Vznikne nový návrh v katalogu textů.</Text></View><Pressable onPress={() => setVisible(false)} style={[styles.close, { backgroundColor: colors.surface }]}><MaterialIcons name="close" size={20} color={colors.foreground} /></Pressable></View>
      <View style={[styles.importCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.cardIcon, { backgroundColor: `${colors.primary}1A` }]}><MaterialIcons name="description" size={22} color={colors.primary} /></View><View style={styles.cardCopy}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Soubory z telefonu nebo webu</Text><Text style={[styles.cardText, { color: colors.muted }]}>TXT, Markdown, HTML, CSV a DOCX. Můžeš vybrat více souborů najednou.</Text></View></View><Pressable disabled={pending} onPress={() => void readFile()} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pending || pressed ? 0.65 : 1 }]}><MaterialIcons name="upload-file" size={19} color="#141317" /><Text style={styles.actionText}>{createDocument.isPending || importDocx.isPending ? "Importuji soubory…" : "Vybrat textové soubory"}</Text></Pressable>
      <View style={styles.divider}><View style={[styles.line, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.muted }]}>nebo</Text><View style={[styles.line, { backgroundColor: colors.border }]} /></View>
      <View style={[styles.importCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.cardIcon, { backgroundColor: `${colors.primary}1A` }]}><MaterialIcons name="article" size={22} color={colors.primary} /></View><View style={styles.cardCopy}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Google Dokument</Text><Text style={[styles.cardText, { color: colors.muted }]}>Dokument musí být nastavený na „kdokoli s odkazem může zobrazit“.</Text></View></View><TextInput value={googleTitle} onChangeText={setGoogleTitle} placeholder="Název skladby nebo textu" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /><TextInput value={googleUrl} onChangeText={setGoogleUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://docs.google.com/document/d/…" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /><Pressable disabled={pending} onPress={() => void importGoogle()} style={({ pressed }) => [styles.outlineAction, { borderColor: colors.primary, opacity: pending || pressed ? 0.65 : 1 }]}><MaterialIcons name="cloud-download" size={19} color={colors.primary} /><Text style={[styles.outlineText, { color: colors.primary }]}>{importGoogleDocument.isPending ? "Načítám dokument…" : "Importovat Google Dokument"}</Text></Pressable>
    </View></View></Modal></>;
}

const styles = StyleSheet.create({ trigger: { height: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }, triggerText: { fontSize: 13, fontWeight: "900" }, shade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" }, sheet: { borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 20, paddingBottom: 28 }, handle: { width: 42, height: 4, borderRadius: 3, alignSelf: "center", marginVertical: 10 }, top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 15 }, title: { fontSize: 18, fontWeight: "900" }, subtitle: { fontSize: 12, marginTop: 3 }, close: { width: 38, height: 38, borderRadius: 13, justifyContent: "center", alignItems: "center" }, importCard: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", gap: 10, marginBottom: 10 }, cardIcon: { width: 39, height: 39, borderRadius: 13, justifyContent: "center", alignItems: "center" }, cardCopy: { flex: 1, gap: 3 }, cardTitle: { fontSize: 14, fontWeight: "900" }, cardText: { fontSize: 11, lineHeight: 15 }, action: { minHeight: 48, borderRadius: 15, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, actionText: { color: "#141317", fontSize: 14, fontWeight: "900" }, divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 15 }, line: { flex: 1, height: 1 }, or: { fontSize: 11, fontWeight: "700" }, input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13, marginBottom: 8 }, outlineAction: { minHeight: 48, borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, outlineText: { fontSize: 14, fontWeight: "900" } });
