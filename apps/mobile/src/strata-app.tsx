import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { DEVELOPMENT_PRESENTATION_URL, STRATA_ORIGIN } from "./config";
import { HomeWebView } from "./home/home-webview";
import { PresentationWebView } from "./presentation/presentation-webview";
import { parsePresentationUrl, type SharePresentationUrl } from "./presentation/presentation-url";
import { InvalidLinkView } from "./shell/shell-state";

/**
 * The app holds no credential. `/home` renders or redirects to sign-in, which sets an HttpOnly
 * session cookie in the WebView's persistent cookie store.
 */
const HOME_URL = `${STRATA_ORIGIN}/home`;

/** Longest the native splash may cover a WebView that has not painted yet. */
const SPLASH_TIMEOUT_MS = 3000;

/** Time away after which returning to the app counts as a new visit and opens Home. */
const NEW_VISIT_AFTER_MS = 30 * 60_000;

/** Lets a link that woke the app arrive before the state resets to Home. */
const RESUME_LINK_GRACE_MS = 500;

type DoorState =
  | { kind: "splash" }
  | { kind: "home"; url: string }
  | { kind: "invalid" }
  | { kind: "presentation"; presentation: SharePresentationUrl };

void SplashScreen.preventAutoHideAsync().catch(() => {});

export function stateForUrl(candidate: string | null): DoorState {
  const selected = candidate === null || isExpoDevelopmentContainer(candidate)
    ? DEVELOPMENT_PRESENTATION_URL
    : candidate;
  if (selected === null) return { kind: "home", url: HOME_URL };
  try {
    const presentation = parsePresentationUrl(selected, STRATA_ORIGIN);
    const { scope } = presentation;
    // Session-scoped addresses go to the persistent WebView; the isolated one discards cookies.
    if (scope.kind !== "share") return { kind: "home", url: presentation.href };
    return { kind: "presentation", presentation: { ...presentation, scope } };
  } catch {
    return { kind: "invalid" };
  }
}

function isExpoDevelopmentContainer(candidate: string): boolean {
  if (!__DEV__) return false;
  try {
    const protocol = new URL(candidate).protocol;
    return protocol === "exp:" || protocol === "exps:";
  } catch {
    return false;
  }
}

export function StrataApp() {
  const [door, setDoor] = useState<DoorState>({ kind: "splash" });
  const receivedWarmLink = useRef(false);
  const lastLinkAt = useRef(0);

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const goHome = useCallback(() => {
    setDoor({ kind: "home", url: HOME_URL });
  }, []);

  useEffect(() => {
    let active = true;
    const subscription = Linking.addEventListener("url", ({ url }) => {
      receivedWarmLink.current = true;
      lastLinkAt.current = Date.now();
      setDoor(stateForUrl(url));
    });

    void Linking.getInitialURL().then((url) => {
      if (active && !receivedWarmLink.current) setDoor(stateForUrl(url));
    }).catch(() => {
      if (active && !receivedWarmLink.current) setDoor(stateForUrl(null));
    });

    // The splash covers the native gap only; hide it on the deadline regardless of network.
    const deadline = setTimeout(hideSplash, SPLASH_TIMEOUT_MS);

    return () => {
      active = false;
      clearTimeout(deadline);
      subscription.remove();
    };
  }, [hideSplash]);

  // Reset to Home after a long absence, or a past incoming link would persist for the process.
  useEffect(() => {
    let leftAt = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        if (leftAt === 0) leftAt = Date.now();
        return;
      }
      const away = leftAt === 0 ? 0 : Date.now() - leftAt;
      leftAt = 0;
      // Wait briefly in case a universal link woke the app.
      settle = setTimeout(() => {
        if (Date.now() - lastLinkAt.current < RESUME_LINK_GRACE_MS) return;
        setDoor((current) => {
          if (current.kind === "invalid") return { kind: "home", url: HOME_URL };
          if (current.kind === "presentation" && away >= NEW_VISIT_AFTER_MS) {
            return { kind: "home", url: HOME_URL };
          }
          return current;
        });
      }, RESUME_LINK_GRACE_MS);
    });
    return () => {
      clearTimeout(settle);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (door.kind === "invalid") hideSplash();
  }, [door.kind, hideSplash]);

  return (
    <View style={styles.app}>
      {door.kind === "home"
        ? <HomeWebView key={door.url} url={door.url} onFirstPaint={hideSplash} />
        : null}
      {door.kind === "invalid" ? <InvalidLinkView onGoHome={goHome} /> : null}
      {door.kind === "presentation" ? (
        <PresentationWebView
          key={door.presentation.href}
          presentation={door.presentation}
          onFirstPaint={hideSplash}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});
