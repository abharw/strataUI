"use client";

import {
  Accordion as AccordionRoot,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/primitives/accordion";

export function Accordion({
  items,
}: {
  items: { id: string; title: string; body: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <AccordionRoot type="multiple" className="font-inherit text-foreground">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} className="not-last:border-b not-last:border-border">
          <AccordionTrigger className="rounded-none py-3 text-ui font-medium hover:no-underline hover:text-foreground/80">
            {item.title}
          </AccordionTrigger>
          <AccordionContent className="text-ui leading-6 text-muted-foreground">
            <p className="whitespace-pre-wrap break-words">{item.body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </AccordionRoot>
  );
}
