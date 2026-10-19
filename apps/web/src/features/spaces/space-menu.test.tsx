/**
 * Space menu tests. The Drawer is portalled and absent from a static render, so its panels are
 * rendered directly inside the Space menu provider.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { Button } from "@/shared/ui/primitives/button";

import { writeClipboardText } from "@/shared/ui/overflow-menu";
import { deletionConsequence, SpaceDirectoryActions, SpaceMenuTrigger } from "./space-menu";
import { SpaceMenuActionsPanel } from "./space-menu-actions";
import { deleteSpaceQuestion } from "./space-menu-delete";
import { SpaceMenuSharingFooter, SpaceMenuSharingPanel } from "./space-menu-sharing";
import { SpaceMenuProvider, type SpaceMenuInput } from "./space-menu-state";

const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const PACKING = "00000000-0000-4000-8000-000000000003";
const RESERVATIONS = "00000000-0000-4000-8000-000000000004";

/** A Space with two Pages and no link yet. */
const unshared: SpaceMenuInput = {
  spaceId: SPACE_ID,
  name: "Field notes",
  initialShareUrl: null,
  activePageCount: 2,
  sharedPageCount: 0,
  selectionPages: [
    { id: PACKING, title: "Packing list", shared: false },
    { id: RESERVATIONS, title: "Reservations", shared: false },
  ],
};

/** The same Space once its link carries one of the two Pages. */
const shared: SpaceMenuInput = {
  ...unshared,
  initialShareUrl: "https://strata.test/share/spk_field",
  sharedPageCount: 1,
  selectionPages: [
    { id: PACKING, title: "Packing list", shared: true },
    { id: RESERVATIONS, title: "Reservations", shared: false },
  ],
};

function panelHtml(panel: ReactNode, space: SpaceMenuInput = unshared): string {
  return renderToStaticMarkup(<SpaceMenuProvider {...space}>{panel}</SpaceMenuProvider>);
}

function rowCount(html: string): number {
  return html.split('data-chrome-action-row=""').length - 1;
}

/** Whether the checklist's checkbox for this Page renders checked. */
function isChecked(html: string, pageId: string): boolean {
  const checkbox = new RegExp(`<button[^>]*id="space-${SPACE_ID}-page-${pageId}"[^>]*>`, "u").exec(html);
  if (checkbox === null) throw new Error(`No checkbox for ${pageId}`);
  return checkbox[0].includes('aria-checked="true"');
}

describe("the Space action menu", () => {
  it("opens from the control it is handed, and draws nothing else until it does", () => {
    const html = renderToStaticMarkup(
      <SpaceDirectoryActions {...unshared}>
        <SpaceMenuTrigger>
          <Button data-space-door="">2 Pages · Not shared</Button>
        </SpaceMenuTrigger>
      </SpaceDirectoryActions>,
    );

    // The caller's element becomes the trigger with its content intact.
    expect(html).toContain('data-space-door=""');
    expect(html).toContain("2 Pages · Not shared");
    expect(html).toContain('data-slot="drawer-trigger"');
    expect(html).not.toContain('data-chrome-action-trigger=""');
    expect(html).not.toContain("Delete Space");
  });

  it("offers to share a Space that has no link yet, or to delete it", () => {
    const html = panelHtml(<SpaceMenuActionsPanel />);

    expect(html).toContain("Share Space");
    expect(html).toContain("One link for the Pages you choose");
    expect(html).toContain("Delete Space");
    expect(rowCount(html)).toBe(2);
  });

  it("keeps the top level to copy, sharing, and delete once there is a link", () => {
    const html = panelHtml(<SpaceMenuActionsPanel />, shared);
    const order = ["Copy Space link", ">Sharing<", "Delete Space"].map((label) => html.indexOf(label));

    expect(html).toContain("Opens the 1 shared Page");
    expect(html).toContain("1 of 2 Pages");
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(rowCount(html)).toBe(3);
  });
});

describe("the Space sharing panel", () => {
  it("offers to reset the Space link only once there is a link, with its consequence beside it", () => {
    expect(panelHtml(<SpaceMenuSharingPanel />)).not.toContain("Reset link");

    const html = panelHtml(<SpaceMenuSharingPanel />, shared);
    expect(html).toContain("Reset link");
    expect(html).toContain("Everyone with the current link loses access. You get a new link.");
  });

  it("lists every Page as a checkbox under one Pages heading", () => {
    const html = panelHtml(<SpaceMenuSharingPanel />);

    expect(html).toContain(">Pages</p>");
    expect(html).toContain("Pages to include");
    expect(html.split('role="checkbox"').length - 1).toBe(2);
    expect(html).toContain("Packing list");
    expect(html).toContain("Reservations");
  });

  it("checks every Page for a first share", () => {
    const html = panelHtml(<SpaceMenuSharingPanel />);

    expect(isChecked(html, PACKING)).toBe(true);
    expect(isChecked(html, RESERVATIONS)).toBe(true);
  });

  it("checks only the Pages already in the link when editing it", () => {
    const html = panelHtml(<SpaceMenuSharingPanel />, shared);

    expect(isChecked(html, PACKING)).toBe(true);
    expect(isChecked(html, RESERVATIONS)).toBe(false);
  });

  it("lets each Page title label its own checkbox", () => {
    const html = panelHtml(<SpaceMenuSharingPanel />);

    expect(html).toMatch(new RegExp(`<label[^>]*for="space-${SPACE_ID}-page-${PACKING}"[^>]*>[\\s\\S]*?Packing list`, "u"));
  });

  it("creates the link on a first share and saves changes after that, with Cancel first", () => {
    const first = panelHtml(<SpaceMenuSharingFooter />);
    expect(first).toContain(">Create link<");
    expect(first.indexOf(">Cancel<")).toBeLessThan(first.indexOf(">Create link<"));

    expect(panelHtml(<SpaceMenuSharingFooter />, shared)).toContain(">Save<");
  });
});

describe("deleting a Space", () => {
  it("names the Space it is about to delete and asks with a destructive Delete", () => {
    expect(deleteSpaceQuestion("Field notes", 5)).toEqual({
      title: "Delete Field notes?",
      description: deletionConsequence(5),
      act: "Delete",
      busy: "Deleting…",
      destructive: true,
    });
  });

  it("says how many Pages go with it", () => {
    expect(deletionConsequence(5)).toBe(
      "Its 5 Pages go with it. It’s gone for everyone, links stop opening, and this can’t be undone.",
    );
    expect(deletionConsequence(1)).toBe(
      "Its 1 Page goes with it. It’s gone for everyone, links stop opening, and this can’t be undone.",
    );
    expect(deletionConsequence(0)).toBe(
      "It has no Pages. It’s gone for everyone, links stop opening, and this can’t be undone.",
    );
  });
});

/** A denied clipboard resolves to false rather than throwing; both Drawers rely on it. */
describe("writing to a clipboard that refuses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says no when the browser denies the write", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("Write permission denied")));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(writeClipboardText("https://strata.test/share/space")).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("says no when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});

    await expect(writeClipboardText("https://strata.test/share/space")).resolves.toBe(false);
  });

  it("says yes when the write lands", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });

    await expect(writeClipboardText("https://strata.test/share/space")).resolves.toBe(true);
  });
});
