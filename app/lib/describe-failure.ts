export function describeFailure(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current !== undefined && parts.length < 4) {
    parts.push(
      current instanceof Error
        ? `${current.name}: ${current.message}`
        : String(current),
    );
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(" ← ");
}
