import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfirmDialogProps } from "@/shared/ui/confirm-dialog";

// The confirmation is portalled and only opens after a press, so it is read from its props.
const confirmDialog = vi.hoisted(() => vi.fn((_props: ConfirmDialogProps) => null));

vi.mock("@/app/(owner)/home/actions", () => ({ disconnectAgent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/shared/ui/confirm-dialog", () => ({ ConfirmDialog: confirmDialog }));

import type { AgentRoster } from "@/server/credentials/agents";

import { AgentsList } from "./agents-list";

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
  {
    grantId: "0f2b8c11-1a4e-4f60-9d21-6c0b7f3ae002",
    label: "chatgpt (work)",
    driver: "chatgpt",
    mode: "static",
    connectedAt: "2026-07-02T09:00:00.000Z",
    lastUsedAt: null,
    revokedAt: "2026-08-21T09:00:00.000Z",
  },
];

beforeEach(() => {
  confirmDialog.mockClear();
});

describe("the Agents list", () => {
  it("keeps a disconnected agent's history readable instead of dimming the row", () => {
    const html = renderToStaticMarkup(<AgentsList agents={agents} />);

    // Only the avatar fades; the history line keeps the muted text colour.
    expect(html).toContain('data-strata-agent-avatar="revoked"');
    expect(html).toContain("text-product-muted-foreground");
  });

  it("offers Disconnect only for an agent that is still connected", () => {
    const html = renderToStaticMarkup(<AgentsList agents={agents} />);

    expect(html.match(/>\s*Disconnect\s*</gu)).toHaveLength(1);
  });

  it("asks before disconnecting, naming the agent and the extent of the act", () => {
    renderToStaticMarkup(<AgentsList agents={agents} />);
    const question = confirmDialog.mock.calls
      .map(([props]) => props)
      .find((props) => props.title === "Disconnect Instinct?");

    // Cancel-first, focus and focus return are ConfirmDialog's contract.
    expect(question).toMatchObject({
      open: false,
      description:
        "Its own key stops working. Other agents and shared links are unaffected, and connecting it again takes a new code.",
      cancelLabel: "Keep connected",
      confirmLabel: "Disconnect",
      pendingLabel: "Disconnecting…",
      destructive: true,
    });
  });
});
