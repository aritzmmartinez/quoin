import { describe, it, expect, vi } from "vitest";

import { asFocusable, returnFocus } from "./focus-return";

describe("asFocusable", () => {
  it("keeps anything with a focus method", () => {
    const element = { focus: vi.fn() };
    expect(asFocusable(element)).toBe(element);
  });

  it("drops what cannot take focus", () => {
    expect(asFocusable(null)).toBeNull();
    expect(asFocusable(undefined)).toBeNull();
    expect(asFocusable({})).toBeNull();
    expect(asFocusable({ focus: "nope" })).toBeNull();
  });
});

describe("returnFocus", () => {
  it("focuses the saved element", () => {
    const element = { focus: vi.fn(), isConnected: true };
    expect(returnFocus(element)).toBe(true);
    expect(element.focus).toHaveBeenCalledOnce();
  });

  it("does nothing without a saved element", () => {
    expect(returnFocus(null)).toBe(false);
  });

  it("refuses an element that has left the document", () => {
    const element = { focus: vi.fn(), isConnected: false };
    expect(returnFocus(element)).toBe(false);
    expect(element.focus).not.toHaveBeenCalled();
  });
});
