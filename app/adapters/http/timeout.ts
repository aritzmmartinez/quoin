export interface TimeoutOptions {
  signal?: AbortSignal | undefined;
}

export function timeoutError(timeoutMs: number): DOMException {
  return new DOMException(
    `No answer within ${timeoutMs / 1000} s`,
    "TimeoutError",
  );
}

export async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions = {},
): Promise<T> {
  options.signal?.throwIfAborted();

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(timeoutError(timeoutMs)),
    timeoutMs,
  );
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([run(signal), aborted]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
