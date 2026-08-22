import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarButton: HapticTab, tabBarStyle: { height: 57 + bottomPadding, paddingTop: 7, paddingBottom: bottomPadding, backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 0.5 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "700" } }}>
      <Tabs.Screen name="index" options={{ title: "Přehled", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="texts" options={{ title: "Texty", tabBarIcon: ({ color }) => <IconSymbol size={23} name="square.and.pencil" color={color} /> }} />
      <Tabs.Screen name="albums" options={{ title: "Alba", tabBarIcon: ({ color }) => <IconSymbol size={23} name="rectangle.stack.fill" color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: "Knihovna", tabBarIcon: ({ color }) => <IconSymbol size={23} name="music.note.list" color={color} /> }} />
      <Tabs.Screen name="assistant" options={{ title: "Asistent", tabBarIcon: ({ color }) => <IconSymbol size={23} name="sparkles" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Nastavení", tabBarIcon: ({ color }) => <IconSymbol size={23} name="gearshape.fill" color={color} /> }} />
    </Tabs>
  );
}
