import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

/** Legacy route: private SongCraft accounts no longer use an OAuth callback. */
export default function LegacyOAuthCallback() {
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    router.replace("/auth");
  }, [router]);

  return (
    <ScreenContainer className="items-center justify-center gap-3 p-5">
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.muted }}>Přesměrování na soukromé přihlášení…</Text>
      <View />
    </ScreenContainer>
  );
}
