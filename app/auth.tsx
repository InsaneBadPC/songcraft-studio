import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";

export default function AuthScreen() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const withAccount = async (mode: "signIn" | "signUp") => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 8) {
      Alert.alert("Doplň přihlášení", "Zadej e-mail a heslo alespoň o 8 znacích.");
      return;
    }
    setLoading(true);
    const result = mode === "signIn"
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { display_name: "Temney" } } });
    setLoading(false);
    if (result.error) {
      Alert.alert(mode === "signIn" ? "Přihlášení se nezdařilo" : "Účet se nepodařilo vytvořit", result.error.message);
      return;
    }
    if (mode === "signUp" && !result.data.session) {
      Alert.alert("Potvrď e-mail", "Otevři zprávu v e-mailu a potvrď účet. Potom se zde přihlas stejnými údaji.");
      return;
    }
    router.replace("/(tabs)" as never);
  };

  return <ScreenContainer className="p-5 justify-center"><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.icon, { backgroundColor: `${colors.primary}25` }]}><MaterialIcons name="lock-person" size={29} color={colors.primary} /></View>
    <Text style={[styles.title, { color: colors.foreground }]}>Tvoje soukromé studio</Text>
    <Text style={[styles.text, { color: colors.muted }]}>Přihlas se stejným účtem na telefonu i webu. Texty, přebaly a MP3 se pak ukládají pouze do tvého externího cloudu.</Text>
    <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
    <TextInput value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry placeholder="Heslo (min. 8 znaků)" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
    <Pressable disabled={loading} onPress={() => void withAccount("signIn")} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: loading || pressed ? 0.68 : 1 }]}><Text style={styles.primaryText}>{loading ? "Ověřuji…" : "Přihlásit se"}</Text></Pressable>
    <Pressable disabled={loading} onPress={() => void withAccount("signUp")} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: loading || pressed ? 0.68 : 1 }]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>Vytvořit soukromý účet</Text></Pressable>
  </View></ScreenContainer>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 12 }, icon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center" }, title: { fontSize: 22, fontWeight: "900", marginTop: 4 }, text: { fontSize: 13, lineHeight: 19, marginBottom: 5 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 15 }, primary: { height: 51, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 4 }, primaryText: { color: "#141317", fontSize: 15, fontWeight: "900" }, secondary: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, secondaryText: { fontSize: 14, fontWeight: "800" } });
