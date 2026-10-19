import { describe, expect, it } from "vitest";
import * as z from "zod";

import { invalidRequest, zodErrors } from "./errors";

const NEXT = ["get_guide"] as const;

describe("the zod-to-refusal shaper", () => {
  it("emits a canonical, escaped JSON Pointer rather than a raw join", () => {
    const schema = z.strictObject({ elements: z.record(z.string(), z.strictObject({ text: z.string() })) });
    const error = schema.safeParse({ elements: { "a/b~c": { text: 4 } } }).error!;
    expect(zodErrors(error, { next: NEXT })[0]?.path).toBe("/elements/a~1b~0c/text");
  });

  it("names the root with the empty pointer, and with the caller's target when it has one", () => {
    const error = z.strictObject({ a: z.string() }).safeParse("not an object").error!;
    expect(zodErrors(error, { next: NEXT })[0]?.path).toBe("");
    expect(zodErrors(error, { next: NEXT, rootPath: "/elements" })[0]?.path).toBe("/elements");
    expect(zodErrors(error, { next: NEXT, prefix: "/spec" })[0]?.path).toBe("/spec");
  });

  it("says what a closed body does with an invented field", () => {
    const error = z.strictObject({ summary: z.string() }).safeParse({ summary: "x", note: "y" }).error!;
    expect(zodErrors(error, { next: NEXT })[0]?.error).toContain("send only the documented fields");
  });

  it("opens up a union that matched nothing instead of forwarding \"Invalid input\"", () => {
    const schema = z.strictObject({ value: z.union([z.number(), z.boolean()]) });
    const error = schema.safeParse({ value: "8" }).error!;
    const [issue] = zodErrors(error, { next: NEXT });
    expect(issue?.error).toContain("expected number, received string");
    expect(issue?.error).toContain("expected boolean, received string");
    expect(issue?.path).toBe("/value");
  });

  it("leaves an authored union message alone", () => {
    const schema = z.strictObject({
      value: z.union([z.number(), z.boolean()], { error: "send a number or a boolean" }),
    });
    const error = schema.safeParse({ value: "8" }).error!;
    expect(zodErrors(error, { next: NEXT })[0]?.error).toBe("send a number or a boolean");
  });

  it("surfaces the grammar a record key broke, which zod hides one level down", () => {
    const schema = z.record(z.string().regex(/^[a-z]+$/, "keys are lowercase letters"), z.string());
    const error = schema.safeParse({ Nope: "x" }).error!;
    const [issue] = zodErrors(error, { next: NEXT });
    expect(issue?.error).toBe("Invalid key in record: keys are lowercase letters");
    expect(issue?.path).toBe("/Nope");
  });

  it("carries the first problem in error and the rest alongside it", () => {
    const error = z.strictObject({ a: z.string(), b: z.string() }).safeParse({ a: 1, b: 2 }).error!;
    const result = invalidRequest(error, NEXT);
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("invalid_request");
    expect(result.body.path).toBe("/a");
    expect((result.body.errors as { path: string }[]).map((issue) => issue.path)).toEqual(["/b"]);
  });
});
