import { describe, it, expect, vi } from "vitest";

import {
  ingestCloseIntent,
  resolveClose,
  shouldBounceForcedClose,
} from "./close-guard";

describe("ingestCloseIntent", () => {
  it("blocks while a request is in flight, whatever else is true", () => {
    expect(
      ingestCloseIntent({ inFlight: true, imported: false, atDone: false }),
    ).toBe("block");
    expect(
      ingestCloseIntent({ inFlight: true, imported: true, atDone: true }),
    ).toBe("block");
  });

  it("asks for confirmation once the import has written but the summary is not shown", () => {
    expect(
      ingestCloseIntent({ inFlight: false, imported: true, atDone: false }),
    ).toBe("confirm");
  });

  it("allows a clean close before anything is written", () => {
    expect(
      ingestCloseIntent({ inFlight: false, imported: false, atDone: false }),
    ).toBe("allow");
  });

  it("allows the close once the summary step is reached", () => {
    expect(
      ingestCloseIntent({ inFlight: false, imported: true, atDone: true }),
    ).toBe("allow");
  });
});

describe("resolveClose", () => {
  it("does not close and does not confirm when blocked", () => {
    const onConfirm = vi.fn();
    expect(resolveClose("block", onConfirm)).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not close but raises the confirmation when asked to confirm", () => {
    const onConfirm = vi.fn();
    expect(resolveClose("confirm", onConfirm)).toBe(false);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("closes without confirming when allowed", () => {
    const onConfirm = vi.fn();
    expect(resolveClose("allow", onConfirm)).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("shouldBounceForcedClose", () => {
  it("bounces a forced close only while a request is in flight", () => {
    expect(shouldBounceForcedClose(true)).toBe(true);
    expect(shouldBounceForcedClose(false)).toBe(false);
  });
});
