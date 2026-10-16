export interface InTurnOptions<T, R> {
  onError: (error: unknown, item: T) => R;
  onEach?: (result: R, index: number) => void;
  stopped?: () => boolean;
}

export async function inTurn<T, R>(
  items: readonly T[],
  step: (item: T) => Promise<R>,
  options: InTurnOptions<T, R>,
): Promise<R[]> {
  const results: R[] = [];
  for (const [index, item] of items.entries()) {
    if (options.stopped?.()) break;
    let result: R;
    try {
      result = await step(item);
    } catch (error) {
      result = options.onError(error, item);
    }
    results.push(result);
    options.onEach?.(result, index);
  }
  return results;
}
