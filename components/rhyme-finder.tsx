import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { findCzechRhymes } from "@/lib/czech-rhymes";
import { fetchExternalAiRhymes, type AiRhymes } from "@/lib/external-studio";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export function RhymeFinder({ onInsert, variant = "inline" }: { onInsert: (word: string) => void; variant?: "inline" | "floating" }) {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const snapshot = trpc.studio.snapshot.useQuery(undefined, { enabled: isAuthenticated });
  const createWord = trpc.studio.createCustomRhymeWord.useMutation();
  const deleteWord = trpc.studio.deleteCustomRhymeWord.useMutation();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [ai, setAi] = useState<AiRhymes | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const cacheRef = useRef(new Map<string, AiRhymes>());

  // Při otevření / psaní obnovit výsledky z mezipaměti — hledá se až na tlačítko.
  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim().toLocaleLowerCase("cs");
    const cached = cacheRef.current.get(trimmed);
    setAi(cached ?? null);
    setAiError(null);
  }, [query, visible]);

  const guardResults = (word: string, result: AiRhymes): AiRhymes => {
    const trimmed = word.trim().toLocaleLowerCase("cs");
    const phonetic = (value: string) => value.toLowerCase().replace(/[úů]/g, "u").replace(/[íý]/g, "i").replace(/ě/g, "e").replace(/á/g, "a").replace(/é/g, "e").replace(/ó/g, "o");
    const querySound = phonetic(trimmed);
    const strictGuard = (list: string[]) => {
      const tail = querySound.slice(-2);
      return [...new Set(list.map((entry) => entry.trim()).filter((entry) => entry.toLowerCase() !== trimmed && phonetic(entry).slice(-2) === tail))];
    };
    const looseGuard = (list: string[]) => {
      const vowel = querySound.slice(-1);
      return [...new Set(list.map((entry) => entry.trim()).filter((entry) => entry.toLowerCase() !== trimmed && phonetic(entry).slice(-1) === vowel))];
    };
    return { exact: strictGuard(result.exact), multiword: strictGuard(result.multiword), assonance: looseGuard(result.assonance) };
  };

  const runSearch = async (more: boolean) => {
    const trimmed = query.trim().toLocaleLowerCase("cs");
    if (trimmed.length < 2 || aiLoading || moreLoading) return;
    if (!more && cacheRef.current.has(trimmed)) { setAi(cacheRef.current.get(trimmed)!); setAiError(null); return; }
    const requestId = ++requestRef.current;
    more ? setMoreLoading(true) : setAiLoading(true);
    try {
      const previous = ai;
      const exclude = more && previous ? [...previous.exact, ...previous.multiword, ...previous.assonance] : undefined;
      const result = await fetchExternalAiRhymes(trimmed, exclude);
      const safe = guardResults(trimmed, result);
      if (requestRef.current !== requestId) return;
      setAiError(null);
      if (more && previous) {
        const merged: AiRhymes = {
          exact: [...new Set([...previous.exact, ...safe.exact])],
          multiword: [...new Set([...previous.multiword, ...safe.multiword])],
          assonance: [...new Set([...previous.assonance, ...safe.assonance])],
        };
        cacheRef.current.set(trimmed, merged);
        setAi(merged);
      } else {
        cacheRef.current.set(trimmed, safe);
        setAi(safe);
      }
    } catch (error) {
      if (requestRef.current === requestId) setAiError(error instanceof Error ? error.message : "Hledání se nezdařilo.");
    } finally {
      if (requestRef.current === requestId) { setAiLoading(false); setMoreLoading(false); }
    }
  };
  const customWords = snapshot.data?.rhymeWords;
  const suggestions = useMemo(() => findCzechRhymes(query, 24, customWords?.map((item) => item.word) ?? []), [customWords, query]);
  const choose = (word: string) => { onInsert(word); setVisible(false); };
  const addWord = async () => { if (!query.trim()) return; await createWord.mutateAsync({ word: query.trim() }); await utils.studio.snapshot.invalidate(); };
  const removeWord = async (id: string | number) => { await deleteWord.mutateAsync({ id }); await utils.studio.snapshot.invalidate(); };
  const trigger = <Pressable onPress={() => setVisible(true)} style={({ pressed }) => [variant === "floating" ? [styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primary }] : [styles.trigger, { borderColor: colors.border, backgroundColor: `${colors.primary}12` }], { opacity: pressed ? 0.7 : 1 }]}>{variant === "floating" ? <><MaterialIcons name="auto-awesome" size={22} color="#0A0A0F" /><Text style={[styles.fabLabel, { color: "#0A0A0F" }]}>Rýmy</Text></> : <><MaterialIcons name="auto-awesome" size={19} color={colors.primary} /><View style={styles.triggerCopy}><Text style={[styles.triggerTitle, { color: colors.foreground }]}>Hledač rýmů</Text><Text style={[styles.triggerText, { color: colors.muted }]}>Najdi rým a vlož jej do konce textu.</Text></View><MaterialIcons name="chevron-right" size={22} color={colors.primary} /></>}</Pressable>;
  return <>{trigger}
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}><View style={styles.shade}><View style={[styles.sheet, { backgroundColor: colors.background }]}><View style={[styles.handle, { backgroundColor: colors.border }]} /><View style={styles.top}><View><Text style={[styles.title, { color: colors.foreground }]}>Hledač českých rýmů</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Zadej slovo a vyber návrh pro vložení.</Text></View><Pressable onPress={() => setVisible(false)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="close" size={20} color={colors.foreground} /></Pressable></View><TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Např. noc, láska, svět…" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
      <Pressable onPress={() => void runSearch(false)} disabled={query.trim().length < 2 || aiLoading} style={({ pressed }) => [styles.searchButton, { backgroundColor: colors.primary, opacity: query.trim().length < 2 || aiLoading || pressed ? 0.55 : 1 }]}>
        {aiLoading ? <ActivityIndicator size="small" color="#0A0A0F" /> : <MaterialIcons name="search" size={19} color="#0A0A0F" />}
        <Text style={styles.searchButtonText}>{aiLoading ? "Hledám rýmy…" : "Hledat rýmy"}</Text>
      </Pressable>
      {query.trim().length >= 2 && isAuthenticated ? <Pressable disabled={createWord.isPending} onPress={() => void addWord()} style={({ pressed }) => [styles.addWord, { borderColor: colors.primary, opacity: createWord.isPending || pressed ? 0.65 : 1 }]}><MaterialIcons name="playlist-add" size={18} color={colors.primary} /><Text style={[styles.addWordText, { color: colors.primary }]}>{createWord.isPending ? "Přidávám…" : `Přidat „${query.trim()}“ do mého slovníku`}</Text></Pressable> : null}
      {customWords?.length ? <View style={styles.personalWords}><Text style={[styles.personalTitle, { color: colors.foreground }]}>Můj slovník · {customWords.length}</Text><View style={styles.wordChips}>{customWords.map((item) => <Pressable key={item.id} onPress={() => void removeWord(item.id)} style={({ pressed }) => [styles.wordChip, { backgroundColor: colors.surface, borderColor: colors.border, opacity: deleteWord.isPending || pressed ? 0.65 : 1 }]}><Text style={[styles.wordChipText, { color: colors.foreground }]}>{item.word}</Text><MaterialIcons name="close" size={14} color={colors.muted} /></Pressable>)}</View></View> : null}
      {query.trim().length < 2 ? <View style={styles.empty}><MaterialIcons name="search" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Napiš hledané slovo</Text><Text style={[styles.emptyText, { color: colors.muted }]}>AI najde přesné rýmy, skupinové spojení i zvukově podobná slova.</Text></View> : <FlatList data={[{ key: "content" }]} renderItem={() => (<>
          {aiLoading && !ai ? <View style={styles.aiStatus}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.aiStatusText, { color: colors.muted }]}>AI přemýšlí nad rýmy…</Text></View> : null}
          {aiError ? <View style={styles.aiStatus}><MaterialIcons name="wifi-off" size={16} color={colors.warning} /><Text style={[styles.aiStatusText, { color: colors.muted }]}>{aiError}</Text></View> : null}
          {ai ? <>
            <Pressable onPress={() => void runSearch(true)} disabled={moreLoading} style={({ pressed }) => [styles.moreButton, { borderColor: `${colors.primary}88`, opacity: moreLoading || pressed ? 0.6 : 1 }]}>
              {moreLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="refresh" size={16} color={colors.primary} />}
              <Text style={[styles.moreButtonText, { color: colors.primary }]}>{moreLoading ? "Hledám další…" : "Najdi další rýmy"}</Text>
            </Pressable>
            <RhymeSection title="Přesné rýmy" icon="check-circle" color={colors.success} items={ai.exact} onPick={choose} colors={colors} />
            <RhymeSection title="Skupinové rýmy" icon="link" color={colors.primary} items={ai.multiword} onPick={choose} colors={colors} />
            <RhymeSection title="Zvukově podobné" icon="graphic-eq" color={colors.warning} items={ai.assonance} onPick={choose} colors={colors} />
          </> : null}
          {suggestions.length ? <View style={styles.sectionBlock}><Text style={[styles.sectionTitle, { color: colors.muted }]}>Rychlé návrhy ze slovníku aplikace</Text>{suggestions.map((item) => <Pressable key={item.word} onPress={() => choose(item.word)} style={({ pressed }) => [styles.result, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><View><Text style={[styles.word, { color: colors.foreground }]}>{item.word}</Text><Text style={[styles.label, { color: item.label === "Přesný rým" ? colors.success : colors.muted }]}>{item.label}</Text></View><MaterialIcons name="add-circle-outline" size={21} color={colors.primary} /></Pressable>)}</View> : null}
        </>)} />}
    </View></View></Modal></>;
}

function RhymeSection({ title, icon, color, items, onPick, colors }: { title: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; items: string[]; onPick: (word: string) => void; colors: ReturnType<typeof useColors> }) {
  if (!items.length) return null;
  return <View style={styles.sectionBlock}>
    <View style={styles.sectionHead}><MaterialIcons name={icon} size={15} color={color} /><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>
    <View style={styles.chips}>{items.map((word) => <Pressable key={word} onPress={() => onPick(word)} style={({ pressed }) => [styles.chip, { backgroundColor: `${color}14`, borderColor: `${color}55`, opacity: pressed ? 0.65 : 1 }]}><Text style={[styles.chipText, { color: colors.foreground }]}>{word}</Text><MaterialIcons name="arrow-downward" size={12} color={color} /></Pressable>)}</View>
  </View>;
}

const styles = StyleSheet.create({ fab: { position: "absolute", right: 16, bottom: 26, height: 52, borderRadius: 26, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6, zIndex: 50 }, fabLabel: { fontSize: 13, fontWeight: "900" }, trigger: { minHeight: 62, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, triggerCopy: { flex: 1, gap: 2 }, triggerTitle: { fontSize: 14, fontWeight: "900" }, triggerText: { fontSize: 11, lineHeight: 15 }, shade: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "flex-end" }, sheet: { maxHeight: "84%", borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 20, paddingBottom: 26 }, handle: { width: 42, height: 4, borderRadius: 3, alignSelf: "center", marginVertical: 10 }, top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }, title: { fontSize: 18, fontWeight: "900" }, subtitle: { fontSize: 12, marginTop: 3 }, close: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, input: { minHeight: 49, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 16, marginBottom: 10 }, addWord: { minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginBottom: 10, paddingHorizontal: 10 }, addWordText: { fontSize: 12, fontWeight: "900" }, personalWords: { gap: 7, marginBottom: 12 }, personalTitle: { fontSize: 12, fontWeight: "900" }, wordChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, wordChip: { height: 29, paddingHorizontal: 9, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 4 }, wordChipText: { fontSize: 11, fontWeight: "700" }, results: { gap: 8, paddingBottom: 10 }, result: { minHeight: 58, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, word: { fontSize: 16, fontWeight: "900" }, label: { fontSize: 11, fontWeight: "700", marginTop: 2 }, empty: { paddingVertical: 34, paddingHorizontal: 18, alignItems: "center", gap: 7 }, emptyTitle: { fontSize: 14, fontWeight: "900" }, searchButton: { minHeight: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 10 }, searchButtonText: { color: "#0A0A0F", fontSize: 14, fontWeight: "900" }, moreButton: { minHeight: 40, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }, moreButtonText: { fontSize: 13, fontWeight: "900" }, aiStatus: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }, aiStatusText: { fontSize: 12.5, fontWeight: "700" }, sectionBlock: { marginBottom: 14 }, sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }, sectionTitle: { fontSize: 12.5, fontWeight: "900", letterSpacing: 0.3 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, height: 33, flexDirection: "row", alignItems: "center", gap: 5 }, chipText: { fontSize: 13.5, fontWeight: "800" }, emptyText: { textAlign: "center", fontSize: 12, lineHeight: 17 } });
