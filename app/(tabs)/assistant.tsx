import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { EmptyState, StudioHeader } from "@/components/studio-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startPrivateLogin } from "@/constants/oauth";
import { askStudioAssistant, type StudioAssistantMessage } from "@/lib/assistant-chat";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";

const SUGGESTIONS = [
  "Navrhni refrén podle mých současných textů.",
  "Jaké album bych mohl rozpracovat dál?",
  "Vytvoř prompt pro přebal mé nové skladby.",
];

type Conversation = { id: string; title: string; messages: StudioAssistantMessage[]; createdAt: number; updatedAt: number };
const MAX_CONVERSATIONS = 5;
const storageKey = (userId: string) => `assistant_history_${userId}`;

function titleFromMessages(messages: StudioAssistantMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content.trim() ?? "";
  if (!first) return "Nová konverzace";
  return first.slice(0, 42) + (first.length > 42 ? "…" : "");
}

export default function AssistantScreen() {
  const colors = useColors();
  const { user, isAuthenticated, loading } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<StudioAssistantMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMessages = messages.length > 0;
  const inputDisabled = sending || !isAuthenticated;
  const flatListRef = useRef<FlatList>(null);

  const loadHistory = useCallback(async (uid: string) => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(uid));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Conversation[];
      if (!Array.isArray(parsed) || !parsed.length) return;
      const sorted = parsed.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
      setConversations(sorted);
      setActiveId(sorted[0].id);
      setMessages(sorted[0].messages);
    } catch {}
  }, []);

  const persist = useCallback(async (uid: string, convs: Conversation[]) => {
    try {
      await AsyncStorage.setItem(storageKey(uid), JSON.stringify(convs.slice(0, MAX_CONVERSATIONS)));
    } catch {}
  }, []);

  useEffect(() => {
    if (user?.id) void loadHistory(user.id);
    else {
      setConversations([]);
      setActiveId(null);
      setMessages([]);
    }
  }, [user?.id, loadHistory]);

  const upsertCurrent = useCallback((nextMessages: StudioAssistantMessage[], currentId: string | null, convs: Conversation[]) => {
    const now = Date.now();
    if (!currentId) {
      const id = `conv-${now}`;
      const conv: Conversation = { id, title: titleFromMessages(nextMessages), messages: nextMessages, createdAt: now, updatedAt: now };
      return { convs: [conv, ...convs].slice(0, MAX_CONVERSATIONS), id };
    }
    const updated = convs.map((c) => (c.id === currentId ? { ...c, messages: nextMessages, title: titleFromMessages(nextMessages), updatedAt: now } : c));
    // přesun aktivní nahoru
    updated.sort((a, b) => b.updatedAt - a.updatedAt);
    return { convs: updated.slice(0, MAX_CONVERSATIONS), id: currentId };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (messages.length === 0 && !activeId && conversations.length === 0) return;
    // pokud je aktivní konverzace, ulož ji (debounced)
    const timeout = setTimeout(() => {
      if (!user?.id) return;
      const { convs, id } = upsertCurrent(messages, activeId, conversations);
      // jen pokud se něco změnilo
      const changed = JSON.stringify(convs) !== JSON.stringify(conversations) || id !== activeId;
      if (changed) {
        setConversations(convs);
        setActiveId(id);
        void persist(user.id, convs);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [messages, activeId, conversations, persist, upsertCurrent, user?.id]);

  const startNewConversation = useCallback(async () => {
    if (!user?.id) return;
    // ulož aktuální pokud má zprávy
    let convs = conversations;
    if (messages.length) {
      const res = upsertCurrent(messages, activeId, conversations);
      convs = res.convs;
      await persist(user.id, convs);
    }
    setMessages([]);
    setActiveId(null);
    setError(null);
  }, [user?.id, messages, activeId, conversations, persist, upsertCurrent]);

  const switchConversation = useCallback((id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setActiveId(id);
    setMessages(conv.messages);
    setError(null);
  }, [conversations]);

  const listHeader = useMemo(() => (
    <>
      <StudioHeader eyebrow="Experimentální větev" title="Studio asistent" />
      <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="privacy-tip" size={19} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.muted }]}>Asistent čte pouze texty, alba, skladby a slovník právě přihlášeného účtu. Nic sám neupravuje.</Text>
      </View>
      {isAuthenticated && conversations.length > 0 ? (
        <View style={styles.historyBlock}>
          <View style={styles.historyHead}>
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>Posledních {Math.min(conversations.length, MAX_CONVERSATIONS)} konverzací</Text>
            <Pressable onPress={() => void startNewConversation()} style={({ pressed }) => [styles.newConv, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="add" size={14} color="#0A0A0F" /><Text style={styles.newConvText}>Nová</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyRow}>
            {conversations.map((c) => (
              <Pressable key={c.id} onPress={() => switchConversation(c.id)} style={({ pressed }) => [styles.historyChip, { backgroundColor: c.id === activeId ? colors.primary : colors.surface, borderColor: c.id === activeId ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <MaterialIcons name="chat-bubble-outline" size={13} color={c.id === activeId ? "#0A0A0F" : colors.muted} />
                <Text numberOfLines={1} style={[styles.historyChipText, { color: c.id === activeId ? "#0A0A0F" : colors.foreground }]}>{c.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {!hasMessages ? (
        <View style={styles.suggestions}>
          <Text style={[styles.suggestionTitle, { color: colors.foreground }]}>Začni třeba takto</Text>
          {SUGGESTIONS.map((suggestion) => (
            <Pressable key={suggestion} onPress={() => setDraft(suggestion)} disabled={inputDisabled} style={({ pressed }) => [styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed || inputDisabled ? 0.7 : 1 }]}>
              <MaterialIcons name="auto-awesome" size={17} color={colors.primary} />
              <Text style={[styles.suggestionText, { color: colors.foreground }]}>{suggestion}</Text>
            </Pressable>
          ))}
          <Text style={[styles.disclaimer, { color: colors.muted }]}>Toto je bezplatný textový experiment. Umí připravit prompt pro obal, ale obrázek nevygeneruje.</Text>
        </View>
      ) : null}
    </>
  ), [colors, hasMessages, inputDisabled, conversations, activeId, startNewConversation, switchConversation, isAuthenticated]);

  async function send(text = draft) {
    const content = text.trim();
    if (!content || sending) return;
    const userMessage: StudioAssistantMessage = { id: `user-${Date.now()}`, role: "user", content };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const answer = await askStudioAssistant(content, messages);
      const withAnswer: StudioAssistantMessage[] = [...history, { id: `assistant-${Date.now()}`, role: "assistant", content: answer }];
      setMessages(withAnswer);
      if (user?.id) {
        const { convs, id } = upsertCurrent(withAnswer, activeId, conversations);
        setConversations(convs);
        setActiveId(id);
        await persist(user.id, convs);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Asistent nyní není dostupný.");
    } finally {
      setSending(false);
    }
  }

  async function copyMessage(content: string) {
    try {
      await Clipboard.setStringAsync(content);
      Alert.alert("Zkopírováno", "Odpověď je ve schránce — můžeš ji vložit do promptu nebo textu.");
    } catch {}
  }

  if (loading) return <ScreenContainer />;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock" title="Přihlášení je potřeba" text="Asistent pracuje jen s tvými soukromými materiály." action={<Pressable onPress={() => void startPrivateLogin()} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Přihlásit se</Text></Pressable>} /></ScreenContainer>;

  return (
    <ScreenContainer className="px-5">
      <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={listHeader}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <View style={[styles.message, item.role === "user" ? [styles.userMessage, { backgroundColor: colors.primary }] : [styles.assistantMessage, { backgroundColor: colors.surface, borderColor: colors.border }]]}><View style={styles.messageHead}><Text style={[styles.messageRole, { color: item.role === "user" ? "#141317" : colors.primary }]}>{item.role === "user" ? "Ty" : "Studio asistent"}</Text>{item.role === "assistant" ? <Pressable onPress={() => void copyMessage(item.content)} hitSlop={8} style={({ pressed }) => [styles.copyChip, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="content-copy" size={14} color={colors.muted} /><Text style={[styles.copyChipText, { color: colors.muted }]}>Kopírovat</Text></Pressable> : null}</View><Text selectable style={[styles.messageText, { color: item.role === "user" ? "#141317" : colors.foreground }]}>{item.content}</Text></View>}
          ListFooterComponent={sending ? <View style={[styles.thinking, { backgroundColor: colors.surface, borderColor: colors.border }]}><MaterialIcons name="more-horiz" size={22} color={colors.primary} /><Text style={[styles.thinkingText, { color: colors.muted }]}>Asistent prochází tvé materiály…</Text></View> : null}
        />
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput value={draft} onChangeText={setDraft} editable={!inputDisabled} multiline maxLength={1000} placeholder="Zeptej se na skladby, texty nebo alba…" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground }]} />
          <Pressable onPress={() => void send()} disabled={!draft.trim() || inputDisabled} style={({ pressed }) => [styles.send, { backgroundColor: !draft.trim() || inputDisabled ? colors.border : colors.primary, opacity: pressed ? 0.8 : 1 }]}><MaterialIcons name="arrow-upward" size={20} color="#141317" /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ grow: { flex: 1 }, content: { paddingTop: 14, paddingBottom: 14, gap: 10 }, notice: { flexDirection: "row", gap: 10, borderRadius: 16, borderWidth: 1, padding: 13, marginBottom: 14 }, noticeText: { flex: 1, fontSize: 12, lineHeight: 17 }, historyBlock: { gap: 8, marginBottom: 14 }, historyHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, historyTitle: { fontSize: 12, fontWeight: "800" }, newConv: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 14 }, newConvText: { color: "#0A0A0F", fontSize: 12, fontWeight: "900" }, historyRow: { gap: 7, paddingRight: 12 }, historyChip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 220, paddingHorizontal: 11, height: 32, borderRadius: 16, borderWidth: 1 }, historyChipText: { fontSize: 12, fontWeight: "700", flexShrink: 1 }, suggestions: { gap: 9 }, suggestionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 2 }, suggestion: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10 }, suggestionText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" }, disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 7 }, message: { maxWidth: "88%", borderRadius: 18, padding: 13, gap: 5 }, messageHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, copyChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, height: 24, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" }, copyChipText: { fontSize: 10.5, fontWeight: "800" }, userMessage: { alignSelf: "flex-end", borderBottomRightRadius: 5 }, assistantMessage: { alignSelf: "flex-start", borderWidth: 1, borderBottomLeftRadius: 5 }, messageRole: { fontSize: 11, fontWeight: "800" }, messageText: { fontSize: 14, lineHeight: 20 }, thinking: { alignSelf: "flex-start", flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 }, thinkingText: { fontSize: 12, fontWeight: "700" }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderWidth: 1, borderRadius: 18, padding: 8, marginBottom: 12 }, input: { flex: 1, minHeight: 42, maxHeight: 104, paddingHorizontal: 8, paddingVertical: 9, fontSize: 14, lineHeight: 19 }, send: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, error: { fontSize: 12, lineHeight: 16, marginHorizontal: 4, marginBottom: 7 }, login: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, loginText: { color: "#141317", fontWeight: "800" } });
