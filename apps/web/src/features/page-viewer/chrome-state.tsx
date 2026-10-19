"use client";

/**
 * Shared state and actions for the Page chrome. The document, Drawer rows, sharing panel and
 * confirmation read one pending act, one notice and one store subscription from this context.
 */

import {
  createContext,
  use,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";

import {
  deletePages,
  rotatePageLink,
  setPagePinned,
} from "@/app/(owner)/home/actions";
import type { ChromeNoticeValue } from "@/shared/ui/overflow-menu";
import { useLinkCopy, type LinkOnScreen } from "@/shared/ui/use-link-copy";
import { useTransientNotice } from "@/shared/ui/use-transient-notice";
import type { DirectPageViewer, OwnerPageViewer } from "@/shared/navigation/viewer";

import type { PageSpace, PageStore } from "./state";
import { usePageStore } from "./store";
import { usePageTextCopy, PAGE_TEXT_FAILED } from "./use-page-text-copy";

type PendingAction = "pin" | "copy" | "rotate" | "delete" | null;
type Confirmation = "delete" | "rotate" | null;
/** Access lives one level inside the sharing panel. */
type Panel = "actions" | "sharing";

/** One shallow subscription: every field is written by the same `ingest`, `spec` included. */
const selectChrome = (state: PageStore) => ({
  meta: state.meta,
  space: state.space,
  spec: state.spec,
  user: state.user,
  updating: state.agentUpdating,
  offline: state.offline,
  needsReload: state.needsReload,
  gone: state.gone,
  updatedAt: state.updatedAt,
  recent: state.recent,
  steps: state.steps,
  sequence: state.sequence,
  shared: state.shared,
  // Both are null for every non-owner audience.
  writer: state.writer,
  lastSummary: state.lastSummary,
  setUser: state.setUser,
  setUrl: state.setUrl,
});

/**
 * Copy for the two confirmations. Each renders as an AlertDialog nested over the Drawer, so the
 * Drawer stays visible but inert.
 */
const CONFIRMS: Record<
  Exclude<Confirmation, null>,
  { title: string; description: string; act: string; busy: string; destructive: boolean }
> = {
  delete: {
    title: "Delete this Page?",
    description: "It’s gone for everyone. Links to it stop opening. This can’t be undone.",
    act: "Delete",
    busy: "Deleting…",
    destructive: true,
  },
  rotate: {
    title: "Reset this Page’s link?",
    description:
      "Everyone with the current link loses access. You get a new link. Space links don’t change.",
    act: "Reset link",
    busy: "Resetting…",
    // Nothing is lost: the Page stays and a new link exists.
    destructive: false,
  },
};

type StoredChrome = ReturnType<typeof selectChrome>;

type PageChromeState = {
  menu: boolean;
  panel: Panel;
  pending: PendingAction;
  notice: ChromeNoticeValue;
  copiedLink: boolean;
  linkOnScreen: LinkOnScreen;
};

type PageChromeActions = {
  changeMenu: (nextOpen: boolean) => void;
  setPanel: (panel: Panel) => void;
  setNotice: (notice: ChromeNoticeValue) => void;
  setConfirm: (confirm: Confirmation) => void;
  togglePin: (pinned: boolean) => void;
  rotateLink: () => void;
  deletePage: () => void;
  copyLink: (url: string) => Promise<void>;
  copyPageText: () => Promise<void>;
  leaveSharing: () => void;
};

type PageChromeMeta = Omit<StoredChrome, "space"> & {
  /** Undefined for a forwarded link: there is no Space to go back to. */
  space: PageSpace | undefined;
  /** Null for a forwarded page key. */
  owner: OwnerPageViewer | null;
  /** The served link, or its replacement after a rotation. */
  copyUrl: string | null;
  membership: string;
  confirm: Confirmation;
  asking: (typeof CONFIRMS)[Exclude<Confirmation, null>] | null;
  pageText: ReturnType<typeof usePageTextCopy>;
  linkFieldId: string;
  copyActionRef: RefObject<HTMLButtonElement | null>;
  sharingActionRef: RefObject<HTMLButtonElement | null>;
};

type PageChromeValue = {
  state: PageChromeState;
  actions: PageChromeActions;
  meta: PageChromeMeta;
};

const PageChromeContext = createContext<PageChromeValue | null>(null);

export function usePageChrome(): PageChromeValue {
  const value = use(PageChromeContext);
  if (value === null) {
    throw new Error("Page chrome parts must be inside PageChromeProvider");
  }
  return value;
}

export function PageChromeProvider({
  viewer,
  children,
}: {
  viewer: OwnerPageViewer | DirectPageViewer;
  children: ReactNode;
}) {
  const owner = viewer.kind === "owner" ? viewer : null;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const stored = usePageStore(useShallow(selectChrome));
  const { meta, space: storedSpace, shared, setUser, setUrl } = stored;
  const pageText = usePageTextCopy();
  const linkFieldId = useId();

  // Share-link viewers get no Space header or acts. The store's Space is current (a move arrives
  // on a poll tick); the viewer prop was resolved at serve time.
  const space = owner === null ? undefined : storedSpace ?? owner.space;
  const copyUrl = meta.url;

  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useTransientNotice();
  const [confirm, setConfirm] = useState<Confirmation>(null);
  const [panel, setPanel] = useState<Panel>("actions");
  const {
    copied: copiedLink,
    setCopied: setCopiedLink,
    linkOnScreen,
    setLinkOnScreen,
    writeLink,
  } = useLinkCopy();
  const copyActionRef = useRef<HTMLButtonElement>(null);
  const sharingActionRef = useRef<HTMLButtonElement>(null);

  /** Runs an owner act inside a transition so its revalidated render commits with its result. */
  function run(action: Exclude<PendingAction, null>, act: () => Promise<void>) {
    if (owner === null || pending !== null) return;
    setPending(action);
    setNotice(null);
    startTransition(async () => {
      try {
        await act();
      } catch {
        // Transport errors reject instead of returning a typed failure; keep the Drawer usable.
        setNotice({ kind: "error", text: "Couldn’t finish that. Try again." });
      } finally {
        setPending(null);
      }
    });
  }

  /** Pin is the owner's own curation, so it updates in place without a notice. */
  function togglePin(pinned: boolean) {
    if (owner === null) return;
    run("pin", async () => {
      const result = await setPagePinned(owner.pageId, pinned);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setUser({ pinned });
    });
  }

  function rotateLink() {
    if (owner === null) return;
    run("rotate", async () => {
      const result = await rotatePageLink(owner.pageId);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setUrl(result.url);
      setConfirm(null);
      // Show the new link as text to copy; the clipboard may refuse silently.
      setLinkOnScreen({
        url: shareLink(result.url),
        reset: true,
        note: result.notice ?? "This Page has a new link.",
      });
    });
  }

  function deletePage() {
    if (owner === null) return;
    run("delete", async () => {
      const result = await deletePages([owner.pageId]);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setConfirm(null);
      setMenu(false);
      // Raise the receipt before navigating: the toast store outlives this tree. There is no undo.
      setNotice({ kind: "success", text: result.notice ?? "Page deleted" });
      router.push(owner.space.url);
    });
  }

  /** The shareable address, without this tab's `embed` flag. */
  function shareLink(url: string): string {
    const link = new URL(url, window.location.origin);
    link.searchParams.delete("embed");
    return link.toString();
  }

  /**
   * Copies the given link without minting a new one, so copying after a reset does not reset
   * again. On refusal the link goes on screen, since a policy denial repeats on every retry.
   */
  async function copyLink(url: string) {
    setPending("copy");
    setNotice(null);
    const link = shareLink(url);
    const copied = await writeLink(link);
    setPending(null);
    if (!copied) {
      setNotice({ kind: "error", text: "Couldn’t copy the link. Copy it below." });
      return;
    }
    setCopiedLink(true);
  }

  async function copyPageText() {
    setNotice(null);
    if (!(await pageText.copy())) setNotice({ kind: "error", text: PAGE_TEXT_FAILED });
  }

  /** Leaving Sharing clears its result surface. */
  function leaveSharing() {
    setPanel("actions");
    setNotice(null);
    setLinkOnScreen(null);
    window.requestAnimationFrame(() => sharingActionRef.current?.focus());
  }

  function changeMenu(nextOpen: boolean) {
    setMenu(nextOpen);
    // The notice renders in an open Drawer and toasts when closed; clear it so it is not
    // announced twice.
    if (nextOpen) return;
    setNotice(null);
    setConfirm(null);
    setPanel("actions");
    setLinkOnScreen(null);
  }

  const membership = space === undefined
    ? "Anyone with the Page link"
    : shared
      ? `In the ${space.name} link`
      : `Not in the ${space.name} link`;

  const value: PageChromeValue = {
    state: { menu, panel, pending, notice, copiedLink, linkOnScreen },
    actions: {
      changeMenu,
      setPanel,
      setNotice,
      setConfirm,
      togglePin,
      rotateLink,
      deletePage,
      copyLink,
      copyPageText,
      leaveSharing,
    },
    meta: {
      ...stored,
      space,
      owner,
      copyUrl,
      membership,
      confirm,
      asking: confirm === null ? null : CONFIRMS[confirm],
      pageText,
      linkFieldId,
      copyActionRef,
      sharingActionRef,
    },
  };

  return <PageChromeContext value={value}>{children}</PageChromeContext>;
}
