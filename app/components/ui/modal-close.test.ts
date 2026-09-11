import { describe, it, expect, vi } from "vitest";

import {
  attemptClose,
  handleBackdropClick,
  handleDialogCancel,
} from "./modal-close";

describe("attemptClose", () => {
  it("closes when there is no guard", () => {
    const close = vi.fn();
    attemptClose(undefined, close);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes only when the guard allows it", () => {
    const allowed = vi.fn();
    const refused = vi.fn();
    attemptClose(() => true, allowed);
    attemptClose(() => false, refused);
    expect(allowed).toHaveBeenCalledOnce();
    expect(refused).not.toHaveBeenCalled();
  });
});

describe("handleDialogCancel", () => {
  it("always prevents the default Escape close", () => {
    const preventDefault = vi.fn();
    handleDialogCancel({ preventDefault }, undefined, vi.fn());
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("closes when there is no guard", () => {
    const close = vi.fn();
    handleDialogCancel({ preventDefault: vi.fn() }, undefined, close);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes when the guard allows it", () => {
    const close = vi.fn();
    handleDialogCancel({ preventDefault: vi.fn() }, () => true, close);
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not close when the guard refuses, but still prevents the default", () => {
    const preventDefault = vi.fn();
    const close = vi.fn();
    handleDialogCancel({ preventDefault }, () => false, close);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });
});

describe("handleBackdropClick", () => {
  it("ignores clicks that did not land on the backdrop itself", () => {
    const close = vi.fn();
    const guard = vi.fn(() => true);
    handleBackdropClick({ target: {}, currentTarget: {} }, guard, close);
    expect(guard).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click when the guard allows it", () => {
    const backdrop = {};
    const close = vi.fn();
    handleBackdropClick(
      { target: backdrop, currentTarget: backdrop },
      () => true,
      close,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not close on a backdrop click when the guard refuses", () => {
    const backdrop = {};
    const close = vi.fn();
    handleBackdropClick(
      { target: backdrop, currentTarget: backdrop },
      () => false,
      close,
    );
    expect(close).not.toHaveBeenCalled();
  });
});
