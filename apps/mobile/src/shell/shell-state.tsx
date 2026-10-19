import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const colors = {
  background: "#ffffff",
  foreground: "#171717",
  muted: "#737373",
  border: "#e5e5e5",
  pressed: "#f5f5f5",
};

function StateFrame({
  children,
  placement = "screen",
}: {
  children: ReactNode;
  placement?: "screen" | "overlay";
}) {
  return (
    <SafeAreaView style={[styles.safeArea, placement === "overlay" ? styles.overlay : null]}>
      <View style={styles.frame}>{children}</View>
    </SafeAreaView>
  );
}

function StateCopy({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.copy}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

/** Covers the gap between the native splash and the first painted document. */
export function WebViewBootView() {
  return (
    <StateFrame placement="overlay">
      <ActivityIndicator accessibilityLabel="Loading page" color={colors.foreground} />
    </StateFrame>
  );
}

/** Reached from another app, never from Home, so it needs its own way out. */
export function InvalidLinkView({ onGoHome }: { onGoHome: () => void }) {
  return (
    <StateFrame>
      <StateCopy
        title="That link can’t be opened"
        detail="Strata only opens presentation links from its configured site."
      />
      <View accessibilityRole="toolbar" style={styles.actions}>
        <ActionButton label="Go to Home" onPress={onGoHome} emphasis="primary" />
      </View>
    </StateFrame>
  );
}

export function LoadFailureView({
  onOpenInBrowser,
  onRetry,
}: {
  /** Omitted where the browser has no authority to answer the URL with. */
  onOpenInBrowser?: () => void;
  onRetry: () => void;
}) {
  return (
    <StateFrame>
      <StateCopy
        title="This page didn’t load"
        detail="Check your connection and try again."
      />
      <View accessibilityRole="toolbar" style={styles.actions}>
        <ActionButton label="Try again" onPress={onRetry} emphasis="primary" />
        {onOpenInBrowser === undefined ? null : (
          <ActionButton label="Open in browser" onPress={onOpenInBrowser} emphasis="secondary" />
        )}
      </View>
    </StateFrame>
  );
}

function ActionButton({
  emphasis,
  label,
  onPress,
}: {
  emphasis: "primary" | "secondary";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        emphasis === "primary" ? styles.primaryButton : styles.secondaryButton,
        pressed ? styles.pressedButton : null,
      ]}
    >
      <Text style={emphasis === "primary" ? styles.primaryLabel : styles.secondaryLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
  },
  frame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  copy: {
    width: "100%",
    maxWidth: 420,
    gap: 10,
  },
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    textAlign: "center",
  },
  detail: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    maxWidth: 320,
    gap: 10,
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  secondaryButton: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  pressedButton: {
    opacity: 0.78,
  },
  primaryLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
