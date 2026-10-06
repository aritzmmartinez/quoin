import { describe, it, expect, vi } from "vitest";

import {
  focusAfterBounce,
  ingestCloseIntent,
  resolveClose,
  shouldBounceForcedClose,
} from "./close-guard";

const idle = {
  inFlight: false,
  imported: false,
  atDone: false,
  confirming: false,
};

describe("ingestCloseIntent", () => {
  it("blocks while a request is in flight, whatever else is true", () => {
    expect(ingestCloseIntent({ ...idle, inFlight: true })).toBe("block");
    expect(
      ingestCloseIntent({
        inFlight: true,
        imported: true,
        atDone: true,
        confirming: true,
      }),
    ).toBe("block");
  });

  it("asks for confirmation once the import has written but the summary is not shown", () => {
    expect(ingestCloseIntent({ ...idle, imported: true })).toBe("confirm");
  });

  it("with the confirmation up, a close request means keep importing", () => {
    // Escape on the confirmation is "keep", never "close", and never raises
    // the confirmation a second time.
    expect(
      ingestCloseIntent({ ...idle, imported: true, confirming: true }),
    ).toBe("keep");
  });

  it("allows a clean close before anything is written", () => {
    expect(ingestCloseIntent(idle)).toBe("allow");
  });

  it("allows the close once the summary step is reached", () => {
    expect(ingestCloseIntent({ ...idle, imported: true, atDone: true })).toBe(
      "allow",
    );
  });
});

describe("resolveClose", () => {
  function handlers() {
    return { confirm: vi.fn(), keep: vi.fn() };
  }

  it("does not close and calls nothing when blocked", () => {
    const on = handlers();
    expect(resolveClose("block", on)).toBe(false);
    expect(on.confirm).not.toHaveBeenCalled();
    expect(on.keep).not.toHaveBeenCalled();
  });

  it("does not close but raises the confirmation when asked to confirm", () => {
    const on = handlers();
    expect(resolveClose("confirm", on)).toBe(false);
    expect(on.confirm).toHaveBeenCalledOnce();
    expect(on.keep).not.toHaveBeenCalled();
  });

  it("does not close and dismisses the confirmation on keep", () => {
    const on = handlers();
    expect(resolveClose("keep", on)).toBe(false);
    expect(on.keep).toHaveBeenCalledOnce();
    expect(on.confirm).not.toHaveBeenCalled();
  });

  it("closes without confirming when allowed", () => {
    const on = handlers();
    expect(resolveClose("allow", on)).toBe(true);
    expect(on.confirm).not.toHaveBeenCalled();
    expect(on.keep).not.toHaveBeenCalled();
  });
});

describe("shouldBounceForcedClose", () => {
  const settled = {
    inFlight: false,
    imported: false,
    atDone: false,
    closeConfirmed: false,
  };

  it("bounces a forced close while a request is in flight", () => {
    expect(shouldBounceForcedClose({ ...settled, inFlight: true })).toBe(true);
    expect(
      shouldBounceForcedClose({
        ...settled,
        inFlight: true,
        closeConfirmed: true,
      }),
    ).toBe(true);
  });

  it("bounces Chrome's unpreventable second Escape before the summary", () => {
    expect(shouldBounceForcedClose({ ...settled, imported: true })).toBe(true);
  });

  it("lets the confirmation's own close button through", () => {
    expect(
      shouldBounceForcedClose({
        ...settled,
        imported: true,
        closeConfirmed: true,
      }),
    ).toBe(false);
  });

  it("does not bounce a close the guard would have allowed", () => {
    expect(shouldBounceForcedClose(settled)).toBe(false);
    expect(
      shouldBounceForcedClose({ ...settled, imported: true, atDone: true }),
    ).toBe(false);
  });
});

describe("focusAfterBounce", () => {
  const keepButton = { name: "keep" };
  const field = { name: "field" };

  it("goes to the keep button when the confirmation is still up", () => {
    expect(focusAfterBounce(true, keepButton, field)).toBe(keepButton);
  });

  it("goes back to where the user was once the confirmation is gone", () => {
    expect(focusAfterBounce(false, keepButton, field)).toBe(field);
    expect(focusAfterBounce(false, keepButton, null)).toBeNull();
  });
});
