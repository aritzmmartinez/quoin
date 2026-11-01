import type { FileErrorReason, RowRef } from "./discard";

export class CsvFileError extends Error {
  constructor(
    readonly reason: FileErrorReason,
    readonly column: string | null = null,
    readonly row: RowRef | null = null,
  ) {
    super(`The file cannot be imported: ${reason}`);
    this.name = "CsvFileError";
  }
}

export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvFileError("invalid-encoding");
  }
}
