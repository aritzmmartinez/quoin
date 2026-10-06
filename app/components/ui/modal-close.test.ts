import { describe, it, expect, vi } from "vitest";

import {
  NO_PRESS,
  attemptClose,
  handleBackdropClick,
  handleDialogCancel,
  pressEnded,
  pressStarted,
  type BackdropPress,
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

const backdrop = {};
const input = {};
const onBackdrop = { target: backdrop, currentTarget: backdrop };
const onInput = { target: input, currentTarget: backdrop };

function pressOf(
  down: typeof onBackdrop,
  up: typeof onBackdrop,
): BackdropPress {
  return pressEnded(pressStarted(down), up);
}

describe("backdrop press tracking", () => {
  it("starts with neither end on the backdrop", () => {
    expect(NO_PRESS).toEqual({ down: false, up: false });
  });

  it("records each end separately", () => {
    expect(pressOf(onBackdrop, onBackdrop)).toEqual({ down: true, up: true });
    expect(pressOf(onInput, onBackdrop)).toEqual({ down: false, up: true });
    expect(pressOf(onBackdrop, onInput)).toEqual({ down: true, up: false });
  });
});

describe("handleBackdropClick", () => {
  it("ignores clicks that did not land on the backdrop itself", () => {
    const close = vi.fn();
    const guard = vi.fn(() => true);
    handleBackdropClick(onInput, pressOf(onInput, onInput), guard, close);
    expect(guard).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("does not close after selecting text in an input and releasing over the backdrop", () => {
    const close = vi.fn();
    const guard = vi.fn(() => true);
    handleBackdropClick(onBackdrop, pressOf(onInput, onBackdrop), guard, close);
    expect(guard).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("does not close when the press started on the backdrop and ended inside", () => {
    const close = vi.fn();
    handleBackdropClick(
      onBackdrop,
      pressOf(onBackdrop, onInput),
      () => true,
      close,
    );
    expect(close).not.toHaveBeenCalled();
  });

  it("does not close on a click with no recorded press", () => {
    const close = vi.fn();
    handleBackdropClick(onBackdrop, NO_PRESS, () => true, close);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes on a backdrop press when the guard allows it", () => {
    const close = vi.fn();
    handleBackdropClick(
      onBackdrop,
      pressOf(onBackdrop, onBackdrop),
      () => true,
      close,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not close on a backdrop press when the guard refuses", () => {
    const close = vi.fn();
    handleBackdropClick(
      onBackdrop,
      pressOf(onBackdrop, onBackdrop),
      () => false,
      close,
    );
    expect(close).not.toHaveBeenCalled();
  });
});
