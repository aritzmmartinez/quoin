import { describe, it, expect } from "vitest";

import { FxRatesUnavailableError } from "~/core/ports";

import { describeFailure } from "./describe-failure";

describe("describeFailure", () => {
  it("keeps the HTTP status of an unanswered request", () => {
    expect(describeFailure(new FxRatesUnavailableError("USD", 503))).toBe(
      "FxRatesUnavailableError: Exchange rates unavailable for USD (HTTP 503)",
    );
  });

  it("names the cause when there is no status, such as a timeout", () => {
    const timeout = new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError",
    );
    expect(
      describeFailure(
        new FxRatesUnavailableError("USD", null, { cause: timeout }),
      ),
    ).toBe(
      "FxRatesUnavailableError: Exchange rates unavailable for USD" +
        " ← TimeoutError: The operation was aborted due to timeout",
    );
  });

  it("follows a cause of a cause, such as a parse error inside a request", () => {
    const parse = new Error("ECB CSV row 261: rate \"\"");
    expect(
      describeFailure(
        new FxRatesUnavailableError("USD", 200, { cause: parse }),
      ),
    ).toBe(
      "FxRatesUnavailableError: Exchange rates unavailable for USD (HTTP 200)" +
        ' ← Error: ECB CSV row 261: rate ""',
    );
  });

  it("states a thrown value that is not an Error", () => {
    expect(describeFailure("boom")).toBe("boom");
  });
});
