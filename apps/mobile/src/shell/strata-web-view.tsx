import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Linking, Platform, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import {
  resolutionScript,
  SHELL_ORIGIN_WHITELIST,
  shouldStartNavigation,
  type NavigationDecision,
  type NewWindowDecision,
} from "./navigation";
import { LoadFailureView, WebViewBootView } from "./shell-state";

/** What to do about an HTTP status the document answered with. */
export type HttpErrorPolicy = (url: string, statusCode: number) => "recover" | "fail" | "ignore";

async function browserPackageForExternalUrl(): Promise<string | undefined> {
  if (Platform.OS !== "android") return undefined;
  const browsers = await WebBrowser.getCustomTabsSupportingBrowsersAsync();
  const browserPackage = browsers.preferredBrowserPackage
    ?? browsers.browserPackages.find((candidate) => browsers.servicePackages.includes(candidate));
  if (browserPackage === undefined) throw new Error("No Custom Tabs browser is available");
  return browserPackage;
}

/**
 * Shared WebView for Home and the isolated share view, which differ only in navigation policy
 * and cookie store. External opens, Android back, recovery and security props live here.
 */
export function StrataWebView({
  url,
  incognito,
  decide,
  decideNewWindow,
  httpErrorPolicy,
  hostsForms = false,
  openInBrowserOnFailure = null,
  onFirstPaint,
}: {
  /** Where the view opens, and where "Try again" returns it. */
  url: string;
  incognito: boolean;
  decide: (candidate: string) => NavigationDecision;
  decideNewWindow: (candidate: string) => NewWindowDecision;
  httpErrorPolicy?: HttpErrorPolicy;
  /** iOS will not raise the keyboard for an autofocused field without this. */
  hostsForms?: boolean;
  /** Offered on the failure screen for capability URLs, which the browser can open. */
  openInBrowserOnFailure?: string | null;
  onFirstPaint?: () => void;
}) {
  const webView = useRef<React.ElementRef<typeof WebView>>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  // The current address, so a recovered renderer returns to the reader's page.
  const currentUrl = useRef(url);
  const [restoredUrl, setRestoredUrl] = useState<string | null>(null);
  // One recovery reload per failure, so a persistent failure shows the error view.
  const recovering = useRef(false);

  const remount = useCallback((target: string | null) => {
    setRestoredUrl(target);
    setRevision((value) => value + 1);
  }, []);

  const openOutside = useCallback(async (
    target: Extract<NavigationDecision, { kind: "external" }>,
  ) => {
    try {
      if (target.transport === "browser") {
        const browserPackage = await browserPackageForExternalUrl();
        await WebBrowser.openBrowserAsync(
          target.href,
          browserPackage === undefined ? undefined : { browserPackage },
        );
        return;
      }
      // No `canOpenURL` gate: on Android 11+ it returns false for undeclared schemes even when a
      // handler exists. `openURL` rejects when nothing can handle the URL.
      await Linking.openURL(target.href);
    } catch {
      Alert.alert("Couldn’t open that link", "No app on this phone can open it.");
    }
  }, []);

  const handleNavigation = useCallback((candidate: string): boolean => {
    return shouldStartNavigation(candidate, decide, (target) => { void openOutside(target); });
  }, [decide, openOutside]);

  const handleNewWindow = useCallback((candidate: string) => {
    const decision = decideNewWindow(candidate);
    if (decision.kind === "resolve") {
      webView.current?.injectJavaScript(resolutionScript(decision.href));
      return;
    }
    if (decision.kind === "external") void openOutside(decision);
  }, [decideNewWindow, openOutside]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  if (failed) {
    return (
      <LoadFailureView
        onOpenInBrowser={openInBrowserOnFailure === null ? undefined : () => {
          void openOutside({
            kind: "external",
            href: openInBrowserOnFailure,
            transport: "browser",
          });
        }}
        onRetry={() => {
          setFailed(false);
          recovering.current = false;
          remount(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* The source is prevalidated; every later top-level request goes through handleNavigation. */}
      <WebView
        key={revision}
        ref={webView}
        style={styles.webView}
        source={{ uri: restoredUrl ?? url }}
        originWhitelist={SHELL_ORIGIN_WHITELIST}
        startInLoadingState
        renderLoading={() => <WebViewBootView />}
        onShouldStartLoadWithRequest={(request) => handleNavigation(request.url)}
        onOpenWindow={(event) => handleNewWindow(event.nativeEvent.targetUrl)}
        onNavigationStateChange={(navigation) => {
          setCanGoBack(navigation.canGoBack);
          if (navigation.url.startsWith("http")) currentUrl.current = navigation.url;
        }}
        onLoad={() => { recovering.current = false; }}
        onLoadEnd={() => onFirstPaint?.()}
        onError={() => setFailed(true)}
        onHttpError={(event) => {
          const verdict = httpErrorPolicy?.(
            event.nativeEvent.url,
            event.nativeEvent.statusCode,
          ) ?? "ignore";
          if (verdict === "fail" || (verdict === "recover" && recovering.current)) {
            setFailed(true);
            return;
          }
          if (verdict === "recover") {
            recovering.current = true;
            remount(null);
          }
        }}
        // WebKit and Android both kill the renderer under memory pressure. iOS reloads in place;
        // Android rebuilds the view, at the current address.
        onContentProcessDidTerminate={() => webView.current?.reload()}
        onRenderProcessGone={() => remount(currentUrl.current)}
        allowsBackForwardNavigationGestures
        allowsLinkPreview={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        incognito={incognito}
        keyboardDisplayRequiresUserAction={!hostsForms}
        mixedContentMode="never"
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        webviewDebuggingEnabled={__DEV__}
        applicationNameForUserAgent="StrataMobile/0.1"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});
