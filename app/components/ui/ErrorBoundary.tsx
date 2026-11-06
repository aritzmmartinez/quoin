import { RotateCw, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { isUnsupportedResidence, useCopy, useFormat } from "~/lib";
import { Button, buttonClass } from "./Button";
import { ErrorState } from "./ErrorState";

export function ErrorBoundary({ error }: { error: unknown }) {
  const { formatClock } = useFormat();
  const t = useCopy();
  const copy = t.portfolio.error;

  if (isUnsupportedResidence(error)) {
    return (
      <ErrorState
        icon={TriangleAlert}
        title={t.unsupportedResidence.title}
        body={t.unsupportedResidence.body}
      />
    );
  }

  return (
    <ErrorState
      icon={TriangleAlert}
      title={copy.title}
      body={copy.body}
      footnote={copy.lastAttempt(formatClock())}
    >
      <Button variant="primary" onClick={() => window.location.reload()}>
        <RotateCw size={14} strokeWidth={1.7} aria-hidden />
        {copy.retry}
      </Button>
      <Link to="/instruments" className={buttonClass()}>
        {copy.sources}
      </Link>
    </ErrorState>
  );
}
