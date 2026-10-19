"use client";

/** The Space link as selectable text, shown after a reset or a clipboard refusal. */

import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";

import { useSpaceMenu } from "./space-menu-state";

export function SpaceLinkField() {
  const {
    state: { linkOnScreen, pending, copied },
    actions: { copy, markCopied },
    meta: { linkFieldId },
  } = useSpaceMenu();

  if (linkOnScreen === null) return null;
  return (
    <Field className="mt-5 gap-2">
      {linkOnScreen.note === "" ? null : (
        <p className="text-supporting leading-5">{linkOnScreen.note}</p>
      )}
      <FieldLabel htmlFor={linkFieldId} className="text-supporting font-medium">
        {linkOnScreen.reset ? "New Space link" : "This Space’s link"}
      </FieldLabel>
      <Input
        id={linkFieldId}
        readOnly
        value={linkOnScreen.url}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="action"
        disabled={pending !== null}
        // Copy only; resetting is a separate row.
        onClick={() => void copy(linkOnScreen.url).then((done) => {
          if (done) markCopied();
        })}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </Field>
  );
}
