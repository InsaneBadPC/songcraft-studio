import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

/** Neonový gradient pro hlavičky a hero prvky. */
export function NeonGradient({ children, style }: { children?: ReactNode; style?: object }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={["#FF2E88", "#7C3AED", "#00D4FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/** Úzký neonový pruh pod nadpisy a kartami. */
export function NeonAccent({ width = 64 }: { width?: number }) {
  return (
    <LinearGradient
      colors={["#FF2E88", "#FFC53D", "#00E68A"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ height: 4, borderRadius: 2, width }}
    />
  );
}

/** Karta s gradientním okrajem (glow rámeček). */
export function GlowCard({ children, style, contentStyle }: { children?: ReactNode; style?: object; contentStyle?: object }) {
  const colors = useColors();
  return (
    <View style={style}>
      <LinearGradient
        colors={[colors.primary, "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glowBorder}
      >
        <View style={[styles.glowInner, { backgroundColor: colors.surface }, contentStyle]}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 22, overflow: "hidden" },
  glowBorder: { borderRadius: 20, padding: 1.5 },
  glowInner: { borderRadius: 19 },
});
