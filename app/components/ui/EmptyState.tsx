import { ErrorState, type ErrorStateProps } from "./ErrorState";

export function EmptyState(props: Omit<ErrorStateProps, "tone" | "frame">) {
  return <ErrorState tone="neutral" frame="card" {...props} />;
}
