import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

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

export default function AssistantScreen() {
  const colors = useColors();
  const { isAuthenticated, loading } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<StudioAssistantMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMessages = messages.length > 0;
  const inputDisabled = sending || !isAuthenticated;

  const listHeader = useMemo(() => (
    <>
      <StudioHeader eyebrow="Experimentální větev" title="Studio asistent" />
      <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="privacy-tip" size={19} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.muted }]}>Asistent čte pouze texty, alba, skladby a slovník právě přihlášeného účtu. Nic sám neupravuje.</Text>
      </View>
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
  ), [colors, hasMessages, inputDisabled]);

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
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content: answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Asistent nyní není dostupný.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <ScreenContainer />;
  if (!isAuthenticated) return <ScreenContainer className="p-5 justify-center"><EmptyState icon="lock" title="Přihlášení je potřeba" text="Asistent pracuje jen s tvými soukromými materiály." action={<Pressable onPress={() => void startPrivateLogin()} style={[styles.login, { backgroundColor: colors.primary }]}><Text style={styles.loginText}>Přihlásit se</Text></Pressable>} /></ScreenContainer>;

  return (
    <ScreenContainer className="px-5">
      <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => <View style={[styles.message, item.role === "user" ? [styles.userMessage, { backgroundColor: colors.primary }] : [styles.assistantMessage, { backgroundColor: colors.surface, borderColor: colors.border }]]}><Text style={[styles.messageRole, { color: item.role === "user" ? "#141317" : colors.primary }]}>{item.role === "user" ? "Ty" : "Studio asistent"}</Text><Text style={[styles.messageText, { color: item.role === "user" ? "#141317" : colors.foreground }]}>{item.content}</Text></View>}
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

const styles = StyleSheet.create({ grow: { flex: 1 }, content: { paddingTop: 14, paddingBottom: 14, gap: 10 }, notice: { flexDirection: "row", gap: 10, borderRadius: 16, borderWidth: 1, padding: 13, marginBottom: 18 }, noticeText: { flex: 1, fontSize: 12, lineHeight: 17 }, suggestions: { gap: 9 }, suggestionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 2 }, suggestion: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10 }, suggestionText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" }, disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 7 }, message: { maxWidth: "88%", borderRadius: 18, padding: 13, gap: 5 }, userMessage: { alignSelf: "flex-end", borderBottomRightRadius: 5 }, assistantMessage: { alignSelf: "flex-start", borderWidth: 1, borderBottomLeftRadius: 5 }, messageRole: { fontSize: 11, fontWeight: "800" }, messageText: { fontSize: 14, lineHeight: 20 }, thinking: { alignSelf: "flex-start", flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 }, thinkingText: { fontSize: 12, fontWeight: "700" }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderWidth: 1, borderRadius: 18, padding: 8, marginBottom: 12 }, input: { flex: 1, minHeight: 42, maxHeight: 104, paddingHorizontal: 8, paddingVertical: 9, fontSize: 14, lineHeight: 19 }, send: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, error: { fontSize: 12, lineHeight: 16, marginHorizontal: 4, marginBottom: 7 }, login: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" }, loginText: { color: "#141317", fontWeight: "800" } });
