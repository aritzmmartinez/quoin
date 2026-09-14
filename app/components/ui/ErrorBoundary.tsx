import { RotateCw, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { es, formatClock } from "~/lib";
import { Button, buttonClass } from "./Button";
import { ErrorState } from "./ErrorState";

export function ErrorBoundary() {
  const copy = es.portfolio.error;

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
      <Link to="/instrumentos" className={buttonClass()}>
        {copy.sources}
      </Link>
    </ErrorState>
  );
}
