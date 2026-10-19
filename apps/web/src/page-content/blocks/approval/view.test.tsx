import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Approval, ApprovalProvider } from "./view";
import { TestViewerFormatting } from "@/page-content/test-format";

const OPTIONS = [
  { id: "book", label: "Book it" },
  { id: "wait", label: "Wait" },
] as const;

describe("approval", () => {
  it("renders the question, its context, and label-only choices for a read-only viewer", () => {
    const html = renderToStaticMarkup(
      <Approval
        id="move"
        question="Book the movers?"
        context="The quote holds until Friday."
        options={OPTIONS}
      />,
    );

    expect(html).toContain("The quote holds until Friday.");
    expect(html).not.toContain('data-slot="approval-explanation"');
    expect(html).toContain('data-slot="approval-option-state"');
    expect(html).not.toContain('data-slot="approval-option"');
    // Named once, on its own control.
    expect(html.match(/Book it/g)).toHaveLength(1);
    expect(html).toMatch(/approval-option-state[^>]*rounded-full/);
    expect(html).not.toMatch(/approval-option-state[^>]*rounded-contained/);
  });

  it("keeps an owner's answers bare, with nothing describing them", () => {
    const html = renderToStaticMarkup(
      <ApprovalProvider
        value={{
          answerable: true,
          asks: { move: { approval_id: "move", ask_seq: 1, question_key: "move-v1", answer: null } },
          stale: [],
          record: async () => {},
        }}
      >
        <Approval id="move" question="Book the movers?" options={OPTIONS} />
      </ApprovalProvider>,
    );

    const buttons = html.match(/<button(?:(?!<\/button>)[\s\S])*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain("Book it");
    expect(buttons[0]).not.toContain("aria-describedby");
  });

  it("explains why a closed page's choices are no longer actionable", () => {
    const html = renderToStaticMarkup(
      <ApprovalProvider
        value={{
          answerable: true,
          asks: {
            move: {
              approval_id: "move",
              ask_seq: 1,
              question_key: "move-v1",
              answer: null,
            },
          },
          stale: [],
          closed: "This Page was deleted, so this question is closed.",
          record: async () => {},
        }}
      >
        <Approval id="move" question="Book the movers?" options={OPTIONS} />
      </ApprovalProvider>,
    );

    expect(html).toContain("This Page was deleted, so this question is closed.");
    expect(html).toContain('data-slot="approval-option-state"');
    expect(html).not.toContain('data-slot="approval-option"');
  });

  it("provides a focus target for an answer that replaces the activated control", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ApprovalProvider
          value={{
            answerable: true,
            asks: {
              move: {
                approval_id: "move",
                ask_seq: 1,
                question_key: "move-v1",
                answer: {
                  chosen_id: "book",
                  chosen_label: "Book it",
                  answered_by: "owner",
                  answered_at: "2026-08-27T12:00:00Z",
                },
              },
            },
            stale: [],
            record: async () => {},
          }}
        >
          <Approval id="move" question="Book the movers?" options={OPTIONS} />
        </ApprovalProvider>
      </TestViewerFormatting>,
    );

    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Recorded");
    expect(html).toContain('<span aria-hidden="true"> · </span>');
    expect(html).toContain("Book it</span>.");
  });

  // The chosen label shows twice: on the recorded pill and in the receipt.
  it("states the recorded choice without repeating the reasoning", () => {
    const html = renderToStaticMarkup(
      <TestViewerFormatting>
        <ApprovalProvider
          value={{
            answerable: true,
            asks: {
              move: {
                approval_id: "move",
                ask_seq: 1,
                question_key: "move-v1",
                answer: {
                  chosen_id: "book",
                  chosen_label: "Book it",
                  answered_by: "owner",
                  answered_at: "2026-08-27T12:00:00Z",
                },
              },
            },
            stale: [],
            record: async () => {},
          }}
        >
          <Approval id="move" question="Book the movers?" options={OPTIONS} />
        </ApprovalProvider>
      </TestViewerFormatting>,
    );

    expect(html.match(/Book it/g)).toHaveLength(2);
    expect(html).toContain("Wait");
    expect(html).not.toContain('data-slot="approval-explanation"');
    expect(html).toContain("Book the movers?");
  });
});
