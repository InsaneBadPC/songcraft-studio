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
    <View className={cn("flex-1", containerClassName)} style={[{ backgroundColor: colors.background }, style]} {...props}>
      {/* Subtle 2026 depth - soft radial glow on top */}
      <LinearGradient colors={["rgba(59,130,246,0.06)", "transparent", "transparent"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320, opacity: 0.6 }} pointerEvents="none" />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.06)" }} pointerEvents="none" />
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={{ flex: 1 }}>
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
