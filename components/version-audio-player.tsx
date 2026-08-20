import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export type PlayableVersion = {
  id: number;
  label: string;
  originalFileName: string;
  storageUrl: string;
  isPrimary: boolean;
};

export function VersionAudioPlayer({ versions }: { versions: PlayableVersion[] }) {
  const colors = useColors();
  const defaultVersion = useMemo(() => versions.find((entry) => entry.isPrimary) ?? versions[0], [versions]);
  const [activeId, setActiveId] = useState<number | null>(defaultVersion?.id ?? null);
  const activeVersion = versions.find((entry) => entry.id === activeId) ?? defaultVersion;
  const player = useAudioPlayer(activeVersion?.storageUrl, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!versions.some((entry) => entry.id === activeId)) setActiveId(defaultVersion?.id ?? null);
  }, [activeId, defaultVersion?.id, versions]);

  useEffect(() => () => { player.pause(); }, [player]);

  if (!activeVersion) return null;
  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  const currentTime = Math.min(Math.max(status.currentTime || 0, 0), duration || Number.MAX_SAFE_INTEGER);
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  const chooseVersion = (next: PlayableVersion) => {
    if (next.id === activeVersion.id) return;
    player.pause();
    setActiveId(next.id);
  };
  const togglePlayback = async () => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      if (status.playing) player.pause();
      else {
        if (duration > 0 && currentTime >= duration - 0.05) player.seekTo(0);
        player.play();
      }
    } catch {
      // Stav přehrávače a zdroj se mohou měnit asynchronně. UI zůstane ovladatelné při dalším pokusu.
    }
  };
  const skip = (seconds: number) => player.seekTo(Math.min(Math.max(currentTime + seconds, 0), duration || 0));

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.titleRow}><View style={[styles.titleIcon, { backgroundColor: `${colors.primary}20` }]}><MaterialIcons name="headphones" size={19} color={colors.primary} /></View><View style={styles.titleCopy}><Text style={[styles.title, { color: colors.foreground }]}>Poslech a porovnání</Text><Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>Přepnutím verze se předchozí poslech zastaví.</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.versions}>{versions.map((version) => { const active = version.id === activeVersion.id; return <Pressable key={version.id} onPress={() => chooseVersion(version)} style={({ pressed }) => [styles.versionChip, { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name={active && status.playing ? "graphic-eq" : version.isPrimary ? "star" : "music-note"} size={15} color={active ? "#141317" : colors.primary} /><Text numberOfLines={1} style={[styles.versionChipText, { color: active ? "#141317" : colors.foreground }]}>{version.label}</Text></Pressable>; })}</ScrollView>
    <View style={[styles.nowPlaying, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={styles.nowCopy}><Text numberOfLines={1} style={[styles.nowLabel, { color: colors.foreground }]}>{activeVersion.label}</Text><Text numberOfLines={1} style={[styles.nowFile, { color: colors.muted }]}>{status.isBuffering ? "Načítám zvuk…" : status.playing ? "Přehrává se" : "Připraveno k poslechu"}</Text></View><View style={[styles.playState, { backgroundColor: status.playing ? `${colors.success}20` : `${colors.primary}18` }]}><MaterialIcons name={status.playing ? "equalizer" : "play-arrow"} size={18} color={status.playing ? colors.success : colors.primary} /></View></View>
    <View style={styles.timelineLabels}><Text style={[styles.time, { color: colors.muted }]}>{formatTime(currentTime)}</Text><Text style={[styles.time, { color: colors.muted }]}>{formatTime(duration)}</Text></View><View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.trackProgress, { width: `${progress}%`, backgroundColor: colors.primary }]} /></View>
    <View style={styles.controls}><Pressable onPress={() => skip(-10)} disabled={!duration} style={({ pressed }) => [styles.minorControl, { borderColor: colors.border, opacity: !duration ? 0.38 : pressed ? 0.65 : 1 }]}><MaterialIcons name="replay-10" size={23} color={colors.foreground} /></Pressable><Pressable onPress={() => void togglePlayback()} style={({ pressed }) => [styles.playControl, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}><MaterialIcons name={status.playing ? "pause" : "play-arrow"} size={29} color="#141317" /></Pressable><Pressable onPress={() => skip(10)} disabled={!duration} style={({ pressed }) => [styles.minorControl, { borderColor: colors.border, opacity: !duration ? 0.38 : pressed ? 0.65 : 1 }]}><MaterialIcons name="forward-10" size={23} color={colors.foreground} /></Pressable></View>
  </View>;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 12 }, titleRow: { flexDirection: "row", alignItems: "center", gap: 9 }, titleIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }, titleCopy: { flex: 1, gap: 2 }, title: { fontSize: 16, fontWeight: "800" }, subtitle: { fontSize: 11, lineHeight: 15 }, versions: { gap: 8, paddingRight: 4 }, versionChip: { maxWidth: 150, minHeight: 35, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 5 }, versionChipText: { flexShrink: 1, fontSize: 12, fontWeight: "800" }, nowPlaying: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 }, nowCopy: { flex: 1, gap: 2 }, nowLabel: { fontSize: 13, fontWeight: "800" }, nowFile: { fontSize: 11 }, playState: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center" }, timelineLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 }, time: { fontSize: 11, fontVariant: ["tabular-nums"] }, track: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: -7 }, trackProgress: { height: "100%", borderRadius: 3 }, controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18 }, minorControl: { width: 46, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, playControl: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
