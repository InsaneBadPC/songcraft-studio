import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { cn } from "@/lib/utils";
import { useColors } from "@/hooks/use-colors";

export interface ScreenContainerProps extends ViewProps {
  edges?: Edge[];
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
}

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  const colors = useColors();
  return (
    <View className={cn("flex-1", containerClassName)} style={[{ backgroundColor: "#050A1F" }, style]} {...props}>
      {/* STUNNING mesh gradient - vibrant, distinctive, not template */}
      <LinearGradient colors={["rgba(124,58,237,0.12)", "rgba(6,182,214,0.08)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 420, opacity: 1 }} pointerEvents="none" />
      <LinearGradient colors={["transparent", "rgba(236,72,153,0.06)", "rgba(124,58,237,0.08)"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 300, opacity: 0.8 }} pointerEvents="none" />
      {/* Subtle noise + top highlight */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(124,58,237,0.18)" }} pointerEvents="none" />
      <View style={{ position: "absolute", top: 1, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.04)" }} pointerEvents="none" />
      {/* Floating orbs - distinctive */}
      <View style={{ position: "absolute", top: -40, right: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(124,58,237,0.08)", opacity: 0.6 }} pointerEvents="none" />
      <View style={{ position: "absolute", top: 120, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(6,182,214,0.06)", opacity: 0.5 }} pointerEvents="none" />
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={{ flex: 1 }}>
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
