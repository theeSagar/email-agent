import { describe, expect, it } from "vitest";

import { isOwnerEmail } from "./owner";

describe("isOwnerEmail", () => {
  const owner = "owner@example.com";

  it("accepts the owner", () => {
    expect(isOwnerEmail("owner@example.com", owner)).toBe(true);
  });

  it("ignores upper case and spaces", () => {
    expect(isOwnerEmail("  Owner@Example.com ", owner)).toBe(true);
  });

  it("rejects anyone else", () => {
    expect(isOwnerEmail("stranger@gmail.com", owner)).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isOwnerEmail(undefined, owner)).toBe(false);
    expect(isOwnerEmail("", owner)).toBe(false);
  });

  it("rejects everyone when OWNER_EMAIL is not configured", () => {
    expect(isOwnerEmail("owner@example.com", undefined)).toBe(false);
    expect(isOwnerEmail("", "")).toBe(false);
  });
});
