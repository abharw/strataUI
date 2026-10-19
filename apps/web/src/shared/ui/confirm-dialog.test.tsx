import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AlertDialogModule from "@/shared/ui/primitives/alert-dialog";

import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

/** What the dialog handed its root and its verb on the last render. */
const handed = vi.hoisted(() => ({
  root: null as { onOpenChange?: (open: boolean, ...details: never[]) => void } | null,
  action: null as { onClick?: (event: MouseEvent<HTMLButtonElement>) => void } | null,
}));

// Base UI mounts the popup into a portal after hydration, so static rendering draws it in place.
vi.mock("@/shared/ui/primitives/alert-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof AlertDialogModule>();
  return {
    ...actual,
    AlertDialog: (props: ComponentProps<typeof actual.AlertDialog>) => {
      handed.root = props;
      return <actual.AlertDialog {...props} />;
    },
    AlertDialogContent: ({ children, ...props }: { children?: ReactNode }) => (
      <div role="alertdialog" {...props}>{children}</div>
    ),
    AlertDialogAction: (props: ComponentProps<typeof actual.AlertDialogAction>) => {
      handed.action = props;
      return <actual.AlertDialogAction {...props} />;
    },
  };
});

function render(props: Partial<ConfirmDialogProps> = {}): string {
  return renderToStaticMarkup(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Delete this Page?"
      description="It’s gone for everyone."
      confirmLabel="Delete"
      onConfirm={() => {}}
      {...props}
    />,
  );
}

function press(): { prevented: boolean } {
  const outcome = { prevented: false };
  handed.action?.onClick?.({
    preventDefault: () => {
      outcome.prevented = true;
    },
  } as MouseEvent<HTMLButtonElement>);
  return outcome;
}

/** The opening tag of the first element carrying `slot`. */
function tagOf(html: string, slot: string): string {
  const at = html.indexOf(`data-slot="${slot}"`);
  expect(at, slot).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

beforeEach(() => {
  handed.root = null;
  handed.action = null;
});

describe("the shared confirmation", () => {
  it("puts Cancel first, so a stray Enter never lands on the destructive verb", () => {
    const html = render({ destructive: true });

    // Base UI focuses the first tabbable element, so DOM order is the whole contract.
    const cancel = html.indexOf('data-slot="alert-dialog-cancel"');
    const action = html.indexOf('data-slot="alert-dialog-action"');
    expect(cancel).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(cancel);
    expect(html).toContain(">Cancel</button>");
  });

  it("names the destructive act red and leaves the reversible one filled", () => {
    expect(tagOf(render({ destructive: true }), "alert-dialog-action")).toContain('data-variant="destructive"');
    expect(tagOf(render(), "alert-dialog-action")).toContain('data-variant="default"');
    expect(tagOf(render(), "alert-dialog-cancel")).toContain('data-variant="outline"');
  });

  it("acts on a press and leaves closing to the caller", async () => {
    const onConfirm = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render({ onConfirm, onOpenChange });

    expect(press().prevented).toBe(false);
    await Promise.resolve();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("refuses a second press while the first is still running", () => {
    let finish = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    render({ onConfirm });

    press();
    press();
    finish();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows the act in flight and holds the verb and the dialog still", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const html = render({ destructive: true, pending: true, pendingLabel: "Deleting…", onConfirm, onOpenChange });

    const action = tagOf(html, "alert-dialog-action");
    expect(action).toContain('aria-busy="true"');
    expect(action).toContain('aria-disabled="true"');
    expect(html).toContain("animate-spin motion-reduce:animate-none");
    expect(html).toContain("Deleting…</button>");
    expect(tagOf(html, "alert-dialog-cancel")).toContain('disabled=""');

    expect(press().prevented).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    // Backdrop and Escape do nothing while the act runs.
    handed.root?.onOpenChange?.(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("lets the caller close it once nothing is running", () => {
    const onOpenChange = vi.fn();
    const html = render({ onOpenChange });

    expect(tagOf(html, "alert-dialog-action")).toContain('aria-busy="false"');
    expect(html).not.toContain("animate-spin");
    expect(tagOf(html, "alert-dialog-cancel")).not.toContain('disabled=""');
    handed.root?.onOpenChange?.(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("the typed-word challenge", () => {
  const challenge = { word: "DELETE", label: "Type DELETE to confirm" };

  it("is absent unless a caller asks for one", () => {
    const html = render({ destructive: true });

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<label");
    expect(tagOf(html, "alert-dialog-action")).toContain('aria-disabled="false"');
  });

  it("labels the field rather than leaving the input to be guessed at", () => {
    const html = render({ destructive: true, challenge });

    const id = /<label[^>]*for="([^"]+)"[^>]*>Type DELETE to confirm<\/label>/u.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`id="${id}"`);
  });

  it("keeps the keyboard from rewriting the typed word", () => {
    const input = /<input[^>]*>/u.exec(render({ destructive: true, challenge }))?.[0] ?? "";

    expect(input).toContain('autoCapitalize="off"');
    expect(input).toContain('autoComplete="off"');
    expect(input).toContain('autoCorrect="off"');
    expect(input).toContain('spellCheck="false"');
  });

  it("keeps the verb inert until the word is there", () => {
    const onConfirm = vi.fn();
    const html = render({ destructive: true, challenge, onConfirm });

    // The attribute informs screen readers; the press is still refused.
    expect(tagOf(html, "alert-dialog-action")).toContain('aria-disabled="true"');
    expect(press().prevented).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
