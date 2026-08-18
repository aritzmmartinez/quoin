import { describe, expect, it } from "vitest";

import {
  backupFileName,
  backupsToRemove,
  BACKUP_NAME,
  KEEP,
  stamp,
} from "./backup-names";

function names(count: number, from = new Date(2026, 7, 9, 8, 0)): string[] {
  return Array.from({ length: count }, (_, i) =>
    backupFileName(new Date(from.getTime() + i * 60_000)),
  );
}

describe("stamp", () => {
  it("is zero-padded so lexical order is chronological", () => {
    expect(stamp(new Date(2026, 0, 5, 9, 7))).toBe("20260105-0907");
  });

  it("uses local time, which is what the reader of the filename is in", () => {
    const when = new Date(2026, 7, 9, 22, 33);
    expect(stamp(when)).toBe("20260809-2233");
  });

  it("sorts a January and a December of the same year correctly", () => {
    const january = stamp(new Date(2026, 0, 1, 0, 0));
    const december = stamp(new Date(2026, 11, 31, 23, 59));
    expect([december, january].sort()).toEqual([january, december]);
  });
});

describe("backupFileName", () => {
  it("matches the pattern rotation looks for", () => {
    expect(BACKUP_NAME.test(backupFileName(new Date(2026, 7, 9, 22, 33)))).toBe(
      true,
    );
  });

  it("matches it with the seconds suffix too", () => {
    expect(
      BACKUP_NAME.test(backupFileName(new Date(2026, 7, 9, 22, 33), 7)),
    ).toBe(true);
  });

  it("pads the seconds suffix", () => {
    expect(backupFileName(new Date(2026, 7, 9, 22, 33), 7)).toBe(
      "quoin-20260809-2233-07.sqlite",
    );
  });
});

describe("backupsToRemove", () => {
  it("removes nothing while at or under the limit", () => {
    expect(backupsToRemove(names(KEEP))).toEqual([]);
    expect(backupsToRemove(names(1))).toEqual([]);
    expect(backupsToRemove([])).toEqual([]);
  });

  it("removes exactly the overflow", () => {
    expect(backupsToRemove(names(KEEP + 5))).toHaveLength(5);
  });

  it("removes the OLDEST, never the newest", () => {
    const all = names(KEEP + 3);
    const doomed = backupsToRemove(all).sort();

    expect(doomed).toEqual(all.slice(0, 3));
    expect(doomed).not.toContain(all.at(-1));
  });

  it("survives being handed the files in any order", () => {
    const all = names(KEEP + 2);
    const shuffled = [...all].reverse();

    expect(backupsToRemove(shuffled).sort()).toEqual(all.slice(0, 2).sort());
  });

  it("ignores files it did not create rather than deleting them", () => {
    const strays = [
      "notes.txt",
      "quoin.sqlite",
      "quoin-2026-08-09.sqlite",
      ".DS_Store",
    ];
    expect(backupsToRemove([...strays, ...names(2)], 0)).toEqual(
      expect.not.arrayContaining(strays),
    );
  });

  it("counts only real backups towards the limit", () => {
    const strays = Array.from({ length: 10 }, (_, i) => `stray-${i}.txt`);
    expect(backupsToRemove([...strays, ...names(2)], 5)).toEqual([]);
  });

  it("keeps a same-minute pair together as two distinct backups", () => {
    const when = new Date(2026, 7, 9, 22, 33);
    const pair = [backupFileName(when), backupFileName(when, 7)];
    expect(backupsToRemove(pair, 2)).toEqual([]);
    expect(backupsToRemove(pair, 1)).toHaveLength(1);
  });

  it("removes everything when told to keep none", () => {
    expect(backupsToRemove(names(3), 0)).toHaveLength(3);
  });

  it("refuses a negative limit instead of slicing from the end", () => {
    expect(() => backupsToRemove(names(3), -1)).toThrow(RangeError);
  });
});
