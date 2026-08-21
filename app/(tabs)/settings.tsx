import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { EmptyState, LoadingState, SectionTitle, StudioHeader } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { downloadOrShareFile } from "@/lib/download-and-share";
import { trpc } from "@/lib/trpc";

export default function SettingsScreen() {
  const colors = useColors();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const authLogout = trpc.auth.logout.useMutation();
  const exportWholeLibrary = trpc.studio.exportWholeLibrary.useMutation();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  if (loading || (isAuthenticated && snapshot.isLoading)) return <ScreenContainer><LoadingState /></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock" title="Připoj své studio" text="Přihlášení vytváří soukromé úložiště pro tvé texty, přebaly a MP3." action={<Pressable onPress={() => void startOAuthLogin()} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Přihlásit se</Text></Pressable>} /></ScreenContainer>;

  const albums = snapshot.data?.albums ?? [];
  const versions = snapshot.data?.versions.length ?? 0;
  const exporting = exportWholeLibrary.isPending;
  const showLogout = () => Alert.alert("Odhlásit SongCraft Studio?", "Lokální obrazovka se odhlásí, data zůstanou bezpečně v cloudu.", [{ text: "Zrušit", style: "cancel" }, { text: "Odhlásit", style: "destructive", onPress: async () => { await authLogout.mutateAsync(); await logout(); } }]);
  const exportLibrary = async (album?: { id: number; name: string }) => {
    setExportStatus(album ? `Sbírám texty, obrázky a MP3 z alba „${album.name}“…` : "Sbírám texty, obrázky, MP3 a metadata z celé knihovny…");
    try {
      const archive = await exportWholeLibrary.mutateAsync(album ? { albumId: album.id } : {});
      setExportStatus("Archiv je připraven. Otevírám uložení do telefonu…");
      await downloadOrShareFile(archive.url, archive.fileName, "application/zip", album ? `Uložit album ${album.name}` : "Uložit kompletní archiv SongCraft Studio");
      Alert.alert("Export je připraven", album ? `Archiv alba „${album.name}“ je připravený k uložení.` : "Archiv obsahuje texty, prompty, alba, obrázky, MP3 i metadata.");
    } catch (error) {
      Alert.alert("Export se nezdařil", error instanceof Error ? error.message : "Zkus to znovu.");
    } finally {
      setExportStatus(null);
    }
  };

  return <ScreenContainer className="px-5"><ScrollView contentContainerStyle={styles.content}><StudioHeader eyebrow="Osobní pracovní prostor" title="Nastavení" />
    <View style={[styles.profile, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: `${colors.primary}26` }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{(user?.name ?? "S").slice(0, 1).toUpperCase()}</Text></View><View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name ?? "SongCraft autor"}</Text><Text numberOfLines={1} style={[styles.profileMail, { color: colors.muted }]}>{user?.email ?? "Soukromý cloudový účet"}</Text></View><MaterialIcons name="verified-user" size={22} color={colors.success} /></View>
    <SectionTitle title="Synchronizace" /><View style={[styles.syncCard, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}55` }]}><MaterialIcons name="cloud-done" size={25} color={colors.success} /><View style={styles.syncCopy}><Text style={[styles.syncTitle, { color: colors.foreground }]}>Cloudové studio je propojeno</Text><Text style={[styles.syncText, { color: colors.muted }]}>Obsah se načítá z tvého zabezpečeného prostoru. Soubory zůstávají oddělené od katalogu.</Text></View></View>
    <View style={styles.statRow}><Stat value={albums.length} label="alb" /><Stat value={snapshot.data?.documents.length ?? 0} label="textů" /><Stat value={versions} label="MP3 verzí" /></View>
    <SectionTitle title="Kompletní záloha" /><Pressable onPress={() => void exportLibrary()} style={({ pressed }) => [styles.libraryExport, { backgroundColor: colors.primary, opacity: exporting || pressed ? 0.68 : 1 }]} disabled={exporting}><MaterialIcons name="archive" size={21} color="#141317" /><View style={styles.libraryExportCopy}><Text style={styles.libraryExportTitle}>{exporting ? "Vytvářím archiv…" : "Exportovat celou knihovnu"}</Text><Text style={styles.libraryExportText}>Texty, prompty, alba, obrázky, MP3 i metadata v jednom ZIP souboru.</Text></View></Pressable>
    {exportStatus ? <View style={[styles.exportProgress, { backgroundColor: `${colors.primary}16`, borderColor: `${colors.primary}4A` }]}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.exportProgressText, { color: colors.foreground }]}>{exportStatus}</Text></View> : null}
    <SectionTitle title="Zálohy jednotlivých alb" />{albums.length ? albums.map((album) => <Pressable key={album.id} disabled={exporting} onPress={() => void exportLibrary(album)} style={({ pressed }) => [styles.albumExport, { backgroundColor: colors.surface, borderColor: colors.border, opacity: exporting || pressed ? 0.65 : 1 }]}><View style={[styles.albumExportIcon, { backgroundColor: `${colors.primary}1C` }]}><MaterialIcons name="folder-zip" size={21} color={colors.primary} /></View><View style={styles.albumExportCopy}><Text numberOfLines={1} style={[styles.albumExportTitle, { color: colors.foreground }]}>{album.name}</Text><Text style={[styles.albumExportText, { color: colors.muted }]}>Exportovat toto album samostatně</Text></View><MaterialIcons name="download" size={20} color={colors.primary} /></Pressable>) : <Text style={[styles.emptyAlbumNote, { color: colors.muted }]}>Založ album, aby šlo stáhnout samostatnou zálohu.</Text>}
    <SectionTitle title="Jak systém pracuje" /><Info icon="edit-note" title="Koncept → skladba" text="Označením textu jako hotového zůstane koncept zachován a vznikne samostatná katalogová položka." /><Info icon="content-copy" title="Bezpečná práce s MP3" text="Při exportu ID3 tagů vzniká nová kopie. Původně nahraná verze se nikdy nepřepisuje." /><Info icon="storage" title="Rozdělené uložení" text="Texty a vazby alb jsou v databázi; přebaly a MP3 jsou v souborovém úložišti." />
    <Pressable onPress={showLogout} style={({ pressed }) => [styles.logout, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><MaterialIcons name="logout" size={20} color={colors.error} /><Text style={[styles.logoutText, { color: colors.error }]}>Odhlásit se</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

function Stat({ value, label }: { value: number; label: string }) { const colors = useColors(); return <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text></View>; }
function Info({ icon, title, text }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string }) { const colors = useColors(); return <View style={styles.info}><View style={[styles.infoIcon, { backgroundColor: `${colors.primary}1C` }]}><MaterialIcons name={icon} size={20} color={colors.primary} /></View><View style={styles.infoCopy}><Text style={[styles.infoTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.infoText, { color: colors.muted }]}>{text}</Text></View></View>; }
const styles = StyleSheet.create({ content: { paddingTop: 14, paddingBottom: 33 }, profile: { borderWidth: 1, borderRadius: 20, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }, avatar: { width: 45, height: 45, borderRadius: 15, alignItems: "center", justifyContent: "center" }, avatarText: { fontSize: 19, fontWeight: "900" }, profileCopy: { flex: 1, gap: 3 }, profileName: { fontSize: 15, fontWeight: "800" }, profileMail: { fontSize: 12 }, syncCard: { borderWidth: 1, padding: 15, borderRadius: 19, flexDirection: "row", gap: 11 }, syncCopy: { flex: 1, gap: 3 }, syncTitle: { fontSize: 14, fontWeight: "800" }, syncText: { fontSize: 12, lineHeight: 17 }, statRow: { flexDirection: "row", gap: 9, marginTop: 10 }, stat: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: 17, padding: 10, justifyContent: "center" }, statValue: { fontSize: 20, fontWeight: "900" }, statLabel: { fontSize: 11, fontWeight: "700" }, libraryExport: { minHeight: 76, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }, libraryExportCopy: { flex: 1, gap: 3 }, libraryExportTitle: { color: "#141317", fontSize: 14, fontWeight: "900" }, libraryExportText: { color: "#141317", fontSize: 11, lineHeight: 15 }, exportProgress: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }, exportProgressText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700" }, albumExport: { minHeight: 64, borderWidth: 1, borderRadius: 16, padding: 11, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }, albumExportIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, albumExportCopy: { flex: 1, gap: 3 }, albumExportTitle: { fontSize: 14, fontWeight: "900" }, albumExportText: { fontSize: 11 }, emptyAlbumNote: { fontSize: 12, lineHeight: 17, marginBottom: 10 }, info: { flexDirection: "row", gap: 11, marginBottom: 16 }, infoIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" }, infoCopy: { flex: 1, gap: 3 }, infoTitle: { fontSize: 14, fontWeight: "800" }, infoText: { fontSize: 12, lineHeight: 17 }, logout: { marginTop: 15, height: 50, borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, logoutText: { fontSize: 14, fontWeight: "800" }, login: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, loginText: { color: "#141317", fontWeight: "800" } });
