import { Empty, EmptyDescription, EmptyHeader } from "@/shared/ui/primitives/empty";

/** Shared rendering of a collection's `empty` sentence, in place of its items. */
export function CollectionEmpty({ text }: { text: string }) {
  return (
    <Empty className="min-h-0 border-0 bg-transparent p-0 py-4">
      <EmptyHeader>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
