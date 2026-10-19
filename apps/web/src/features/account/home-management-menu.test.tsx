/**
 * Home management menu tests. The Drawer and its confirmation are portalled and absent from a
 * static render, so the Drawer content renders in place and the confirmation is read from the
 * props it is handed.
 */
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfirmDialogProps } from "@/shared/ui/confirm-dialog";

const confirmDialog = vi.hoisted(() => vi.fn((_props: ConfirmDialogProps) => null));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/shared/ui/confirm-dialog", () => ({ ConfirmDialog: confirmDialog }));
vi.mock("@/shared/ui/overflow-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/ui/overflow-menu")>();
  return {
    ...actual,
    ChromeActionContent: ({
      title,
      description,
      children,
    }: ComponentProps<typeof actual.ChromeActionContent>) => (
      <div data-drawer-content="">
        <p>{title}</p>
        <p>{description}</p>
        {children}
      </div>
    ),
  };
});

import type { OwnerSessionSummary } from "@/server/auth/owner-session";
import type { AgentRoster } from "@/server/credentials/agents";

import { HomeManagementMenu } from "./home-management-menu";

const agents: AgentRoster[] = [
  {
    grantId: "0f2b8c11-1a4e-4f60-9d21-6c0b7f3ae001",
    label: "Instinct",
    driver: "instinct",
    mode: "rotating",
    connectedAt: "2026-08-12T09:14:00.000Z",
    lastUsedAt: "2026-08-27T12:00:00.000Z",
    revokedAt: null,
  },
];

const sessions: OwnerSessionSummary[] = [
  {
    id: "session-current",
    current: true,
    client_label: "Chrome on Mac",
    created_at: "2026-08-24T14:30:00.000Z",
    last_used_at: "2026-08-28T13:06:00.000Z",
    revoked_at: null,
  },
];

function deleteStrataQuestion(): ConfirmDialogProps | undefined {
  return confirmDialog.mock.calls
    .map(([props]) => props)
    .find((props) => props.title === "Delete your Strata?");
}

beforeEach(() => {
  confirmDialog.mockClear();
});

describe("the Home management menu", () => {
  it("keeps one quiet management trigger in Home chrome", () => {
    const html = renderToStaticMarkup(
      <HomeManagementMenu agents={[]} sessions={[]} />,
    );

    expect(html).toContain('aria-label="Manage Home"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("size-control");
  });

  it("gathers bulk changes and account access in one Drawer", () => {
    const html = renderToStaticMarkup(<HomeManagementMenu agents={agents} sessions={sessions} />);

    expect(html).toContain("Manage Strata");
    expect(html).toContain("Bulk changes and account access.");
    expect(html).toContain("Instinct");
    expect(html).toContain("Chrome on Mac");
  });

  it("heads its sections Agents, Devices, then Account", () => {
    const html = renderToStaticMarkup(<HomeManagementMenu agents={agents} sessions={sessions} />);
    const order = [">Agents</h2>", ">Devices</h2>", ">Account</h2>"].map((heading) => html.indexOf(heading));

    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('id="home-management-account"');
  });

  it("offers selection mode only when the surface behind it can select", () => {
    expect(renderToStaticMarkup(<HomeManagementMenu onSelect={() => {}} />))
      .toContain("Select Pages and Spaces");
    expect(renderToStaticMarkup(<HomeManagementMenu />))
      .not.toContain("Select Pages and Spaces");
  });

  it("always lets the owner delete their Strata, with or without a roster", () => {
    const html = renderToStaticMarkup(<HomeManagementMenu />);

    expect(html).toContain(">Account</h2>");
    expect(html).toContain("Delete my Strata");
  });

  it("states the whole extent of the act, and asks for the word", () => {
    renderToStaticMarkup(<HomeManagementMenu />);

    expect(deleteStrataQuestion()).toMatchObject({
      open: false,
      description:
        "Every Page, Space, link and connected agent is erased for good. Links stop opening for everyone. This can’t be undone.",
      challenge: { word: "DELETE", label: "Type “DELETE” to confirm" },
      confirmLabel: "Delete my Strata",
      pendingLabel: "Deleting…",
      destructive: true,
    });
  });

  it("sets nothing in capitals but the word the person has to type", () => {
    // Copy is sentence case; DELETE is a string to match, not a word to read.
    const html = renderToStaticMarkup(<HomeManagementMenu agents={agents} sessions={sessions} />);
    const question = deleteStrataQuestion();
    const copy = [
      html.replaceAll(/<[^>]*>/gu, " "),
      question?.title,
      question?.description,
      question?.confirmLabel,
      question?.pendingLabel,
      question?.challenge?.label,
    ].join(" ");

    expect(new Set(copy.match(/\b[A-Z]{2,}\b/gu))).toEqual(new Set(["DELETE"]));
  });
});
