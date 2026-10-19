import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ChromeActionMenu,
  ChromeActionNotice,
  ChromeActionTrigger,
} from "./overflow-menu";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("shared chrome actions", () => {
  it("uses the ShadCN Button contract for the standard ellipsis trigger", () => {
    const html = renderToStaticMarkup(
      <ChromeActionMenu>
        <ChromeActionTrigger label="Space actions" />
      </ChromeActionMenu>,
    );

    // The Drawer trigger renders the shared Button, keeping its variants and sizing.
    expect(html).toContain('data-slot="drawer-trigger"');
    expect(html).toContain('data-variant="ghost"');
    expect(html).toContain('data-size="icon"');
    expect(html).toContain('data-chrome-action-trigger=""');
    expect(html).toContain('aria-label="Space actions"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("size-control");
    expect(html).toContain("strata-press");
  });

  it("uses Alert for visible, announced feedback that stays inside the Drawer", () => {
    const success = renderToStaticMarkup(
      <ChromeActionNotice notice={{ kind: "success", text: "Link copied" }} />,
    );
    const error = renderToStaticMarkup(
      <ChromeActionNotice notice={{ kind: "error", text: "Try again" }} />,
    );

    expect(success).toContain('data-slot="alert"');
    expect(success).toContain('data-slot="alert-description"');
    expect(success).toContain('role="status"');
    expect(success).toContain('aria-live="polite"');
    expect(success).toContain("Link copied");
    expect(error).toContain('role="alert"');
    expect(error).toContain('aria-live="assertive"');
    expect(error).toContain("Try again");
  });
});
