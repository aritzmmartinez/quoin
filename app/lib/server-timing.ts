export interface ServerTiming {
  time<T>(name: string, step: () => Promise<T>): Promise<T>;
  time<T>(name: string, step: () => T): T;
  header(): string;
  headers(): Headers;
}

const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function createServerTiming(
  now: () => number = () => performance.now(),
): ServerTiming {
  const start = now();
  const entries: string[] = [];

  const record = (name: string, since: number, failed: boolean) => {
    const dur = (now() - since).toFixed(1);
    entries.push(`${name};dur=${dur}${failed ? ';desc="failed"' : ""}`);
  };

  function time<T>(name: string, step: () => T | Promise<T>): T | Promise<T> {
    if (!TOKEN.test(name)) {
      throw new Error(`Server-Timing name must be an HTTP token: ${name}`);
    }
    const since = now();
    let result: T | Promise<T>;
    try {
      result = step();
    } catch (error) {
      record(name, since, true);
      throw error;
    }
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          record(name, since, false);
          return value;
        },
        (error: unknown) => {
          record(name, since, true);
          throw error;
        },
      );
    }
    record(name, since, false);
    return result;
  }

  const header = () =>
    [...entries, `total;dur=${(now() - start).toFixed(1)}`].join(", ");

  return {
    time: time as ServerTiming["time"],
    header,
    headers: () => new Headers({ "Server-Timing": header() }),
  };
}
