import { describe, expect, it } from "vitest";

import { contentDisposition } from "./policy";

describe("naming a served file in a header", () => {
  it("keeps a plain name as it is", () => {
    expect(contentDisposition("receipt.pdf")).toBe(
      "inline; filename=\"receipt.pdf\"; filename*=UTF-8''receipt.pdf",
    );
  });

  it("survives a name no header byte can hold", () => {
    // Non-ASCII in a quoted header value throws inside fetch's Headers.
    const value = contentDisposition("領収書.pdf");
    expect(value).toContain("filename=\"___.pdf\"");
    expect(value).toContain("filename*=UTF-8''%E9%A0%98%E5%8F%8E%E6%9B%B8.pdf");
    expect(() => new Headers({ "content-disposition": value })).not.toThrow();
  });

  it("drops the characters that would end the header early", () => {
    expect(contentDisposition("a\r\nb\"c.txt")).toBe(
      "inline; filename=\"abc.txt\"; filename*=UTF-8''abc.txt",
    );
  });

  it("still names something when nothing ascii is left", () => {
    expect(contentDisposition("領収書")).toContain("filename=\"___\"");
  });
});
