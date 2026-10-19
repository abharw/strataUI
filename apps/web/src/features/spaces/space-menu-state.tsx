"use client";

/**
 * Shared state and actions for the Space Drawer. Its panels and the externally rendered trigger
 * read one checklist, pending act and clipboard result from this context.
 */

import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";

import { deleteSpaces, rotateSpaceLink, shareSpace } from "@/app/(owner)/home/actions";

import type { ChromeNoticeValue } from "@/shared/ui/overflow-menu";
import { deleteSpaceQuestion, type SpaceQuestion } from "./space-menu-delete";
import { useLinkCopy, type LinkOnScreen } from "@/shared/ui/use-link-copy";
import { useTransientNotice } from "@/shared/ui/use-transient-notice";

type Pending = "share" | "delete" | "rotate" | null;
type Panel = "actions" | "sharing";
/** Confirmations render as an AlertDialog over the Drawer. */
type Confirmation = "delete" | "rotate" | null;

export type SpaceSelectionPage = Readonly<{
  id: string;
  title: string;
  shared: boolean;
}>;

export type SpaceMenuInput = {
  spaceId: string;
  name: string;
  initialShareUrl: string | null;
  activePageCount: number;
  sharedPageCount: number;
  /** Complete active membership; never the search-filtered rows on screen. */
  selectionPages: readonly SpaceSelectionPage[];
};

type SpaceMenuState = {
  open: boolean;
  panel: Panel;
  pending: Pending;
  notice: ChromeNoticeValue;
  copied: boolean;
  linkOnScreen: LinkOnScreen;
  shareUrl: string | null;
  draftSelection: ReadonlySet<string>;
  selectionStale: boolean;
};

type SpaceMenuActions = {
  changeOpen: (nextOpen: boolean) => void;
  openSelection: () => void;
  setPageSelected: (pageId: string, selected: boolean) => void;
  selectAllPages: () => void;
  clearPages: () => void;
  saveSelection: () => void;
  copyExisting: () => void;
  copy: (url: string) => Promise<boolean>;
  markCopied: () => void;
  rotate: () => void;
  remove: () => void;
  cancelPanel: () => void;
  setConfirm: (confirm: Confirmation) => void;
};

type SpaceMenuMeta = {
  spaceId: string;
  name: string;
  selectionPages: readonly SpaceSelectionPage[];
  includedPageCount: number;
  pageCountLabel: string;
  selectedLabel: string;
  title: string;
  description: string;
  confirm: Confirmation;
  asking: SpaceQuestion | null;
  linkFieldId: string;
  firstPanelActionRef: RefObject<HTMLButtonElement | null>;
  firstSelectionRef: RefObject<HTMLButtonElement | null>;
  shareActionRef: RefObject<HTMLButtonElement | null>;
};

type SpaceMenuValue = {
  state: SpaceMenuState;
  actions: SpaceMenuActions;
  meta: SpaceMenuMeta;
};

const SpaceMenuContext = createContext<SpaceMenuValue | null>(null);

export function useSpaceMenu(): SpaceMenuValue {
  const value = use(SpaceMenuContext);
  if (value === null) {
    throw new Error("Space menu parts must be inside SpaceDirectoryActions");
  }
  return value;
}

function selectedPageIds(pages: readonly SpaceSelectionPage[]): ReadonlySet<string> {
  return new Set(pages.filter((page) => page.shared).map((page) => page.id));
}

function allPageIds(pages: readonly SpaceSelectionPage[]): ReadonlySet<string> {
  return new Set(pages.map((page) => page.id));
}

/**
 * A Space has one stable share link and one explicit list of Pages behind it.
 * Direct Page links remain independent, so changing this checklist never
 * pretends to revoke a Page link that somebody already received.
 */
export function SpaceMenuProvider({
  spaceId,
  name,
  initialShareUrl,
  activePageCount,
  sharedPageCount,
  selectionPages,
  children,
}: SpaceMenuInput & { children: ReactNode }) {
  const [, startTransition] = useTransition();
  const [currentShareUrl, setCurrentShareUrl] = useState<string | null>(null);
  const shareUrl = currentShareUrl ?? initialShareUrl;
  const propSelection = selectedPageIds(selectionPages);
  const propSnapshot = `${initialShareUrl ?? ""}|${selectionPages.map((page) => `${page.id}:${page.shared}`).join(",")}`;
  const [receivedPropSnapshot, setReceivedPropSnapshot] = useState(propSnapshot);
  const [savedSelection, setSavedSelection] = useState<ReadonlySet<string>>(
    () => propSelection,
  );
  const [draftSelection, setDraftSelection] = useState<ReadonlySet<string>>(
    () => initialShareUrl === null ? allPageIds(selectionPages) : selectedPageIds(selectionPages),
  );
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useTransientNotice();
  const { copied, setCopied, linkOnScreen, setLinkOnScreen, writeLink } = useLinkCopy();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("actions");
  const [confirm, setConfirm] = useState<Confirmation>(null);
  const [selectionStale, setSelectionStale] = useState(false);
  const linkFieldId = useId();
  const firstPanelActionRef = useRef<HTMLButtonElement>(null);
  const firstSelectionRef = useRef<HTMLButtonElement>(null);
  const shareActionRef = useRef<HTMLButtonElement>(null);

  // Render-time state adjustment keeps the baseline aligned with a revalidated server tree. An
  // open checklist is marked stale instead of overwritten; the action also compares atomically.
  if (receivedPropSnapshot !== propSnapshot) {
    setReceivedPropSnapshot(propSnapshot);
    setCurrentShareUrl(null);
    setSavedSelection(propSelection);
    if (panel === "sharing") {
      setSelectionStale(true);
    } else {
      setDraftSelection(initialShareUrl === null ? allPageIds(selectionPages) : propSelection);
    }
  }

  useEffect(() => {
    if (!open || panel !== "sharing") return;
    const frame = window.requestAnimationFrame(() => {
      (firstSelectionRef.current ?? firstPanelActionRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, panel]);

  /** Copies the link, or leaves it on screen when the clipboard refuses. */
  async function copy(url: string): Promise<boolean> {
    if (await writeLink(url)) return true;
    // A policy refusal repeats on every retry, so the visible link is the recovery.
    setNotice({ kind: "error", text: "Couldn’t copy the link. Copy it below." });
    return false;
  }

  function markCopied() {
    setNotice(null);
    setCopied(true);
  }

  function run(kind: Exclude<Pending, null>, act: () => Promise<void>) {
    if (pending !== null) return;
    setPending(kind);
    setNotice(null);
    startTransition(async () => {
      try {
        await act();
      } catch {
        setNotice({ kind: "error", text: "Couldn’t finish that. Try again." });
      } finally {
        setPending(null);
      }
    });
  }

  function openSelection() {
    setNotice(null);
    setLinkOnScreen(null);
    setSelectionStale(false);
    setDraftSelection(shareUrl === null ? allPageIds(selectionPages) : new Set(savedSelection));
    setPanel("sharing");
  }

  function setPageSelected(pageId: string, selected: boolean) {
    setDraftSelection((held) => {
      const next = new Set(held);
      if (selected) next.add(pageId);
      else next.delete(pageId);
      return next;
    });
  }

  function selectAllPages() {
    setDraftSelection(allPageIds(selectionPages));
  }

  function clearPages() {
    setDraftSelection(new Set());
  }

  function saveSelection() {
    if (selectionStale) return;
    const firstShare = shareUrl === null;
    const nextSelection = [...draftSelection];
    run("share", async () => {
      const result = await shareSpace(spaceId, nextSelection, [...savedSelection]);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }

      setCurrentShareUrl(result.url);
      setSavedSelection(new Set(nextSelection));
      setPanel("actions");
      if (firstShare) {
        // A first share ends in a copy that answers in place; the Drawer stays open.
        if (await copy(result.url)) markCopied();
        return;
      }
      setNotice({ kind: "success", text: "Shared Pages updated" });
      setOpen(false);
    });
  }

  function copyExisting() {
    if (shareUrl === null) return;
    setNotice(null);
    void copy(shareUrl).then((copied) => {
      if (copied) markCopied();
    });
  }

  function rotate() {
    run("rotate", async () => {
      const result = await rotateSpaceLink(spaceId);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setCurrentShareUrl(result.url);
      setConfirm(null);
      // Show the new link as text to copy; the clipboard may refuse silently.
      setLinkOnScreen({
        url: result.url,
        reset: true,
        note: result.notice ?? "This Space has a new link.",
      });
    });
  }

  function remove() {
    run("delete", async () => {
      const result = await deleteSpaces([spaceId]);
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setConfirm(null);
      setOpen(false);
      // No Undo: the delete has already happened.
      setNotice({ kind: "success", text: result.notice ?? "Space deleted" });
    });
  }

  /** Back out of Sharing to the row that opened it. */
  function cancelPanel() {
    setPanel("actions");
    setNotice(null);
    setLinkOnScreen(null);
    window.requestAnimationFrame(() => shareActionRef.current?.focus());
  }

  /** Opening resets the Drawer to its rows; closing clears every result. */
  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setPanel("actions");
    else {
      setNotice(null);
      setCopied(false);
      setLinkOnScreen(null);
      setConfirm(null);
    }
  }

  const includedPageCount = shareUrl === null ? sharedPageCount : savedSelection.size;
  const pageCountLabel = `${activePageCount} Page${activePageCount === 1 ? "" : "s"}`;
  const sharingLabel = shareUrl === null
    ? `${pageCountLabel} · Not shared`
    : `${includedPageCount} of ${pageCountLabel} shared`;
  const selectedLabel = `${draftSelection.size} of ${selectionPages.length} Page${selectionPages.length === 1 ? "" : "s"} shared`;

  const title = panel === "sharing" ? "Sharing" : name;
  const description = panel === "sharing" ? selectedLabel : sharingLabel;

  const asking = confirm === null
    ? null
    : confirm === "rotate"
      ? {
        title: "Reset this Space link?",
        description:
            "Everyone with the current link loses these Pages. You get a new link. Page links don’t change.",
        act: "Reset link",
        busy: "Resetting…",
        // Nothing is lost: the Space stays and the link is new.
        destructive: false,
      }
      : deleteSpaceQuestion(name, activePageCount);

  const value: SpaceMenuValue = {
    state: {
      open,
      panel,
      pending,
      notice,
      copied,
      linkOnScreen,
      shareUrl,
      draftSelection,
      selectionStale,
    },
    actions: {
      changeOpen,
      openSelection,
      setPageSelected,
      selectAllPages,
      clearPages,
      saveSelection,
      copyExisting,
      copy,
      markCopied,
      rotate,
      remove,
      cancelPanel,
      setConfirm,
    },
    meta: {
      spaceId,
      name,
      selectionPages,
      includedPageCount,
      pageCountLabel,
      selectedLabel,
      title,
      description,
      confirm,
      asking,
      linkFieldId,
      firstPanelActionRef,
      firstSelectionRef,
      shareActionRef,
    },
  };

  return <SpaceMenuContext value={value}>{children}</SpaceMenuContext>;
}
