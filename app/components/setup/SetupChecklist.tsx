import { Circle, CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { type SetupStep, useCopy } from "~/lib";
import { IngestModal } from "../ingest/IngestModal";
import { buttonClass } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

export function SetupChecklist({
  icon,
  title,
  body,
  steps,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  steps: readonly SetupStep[];
}) {
  const t = useCopy();
  const copy = t.setup;

  function action(step: SetupStep): ReactNode {
    switch (step.id) {
      case "trades":
        return <IngestModal />;
      case "prices":
        return <Go to="/instruments">{copy.steps.prices.action}</Go>;
      case "target":
        return <Go to="/target">{copy.steps.target.action}</Go>;
      case "funds":
        return <Go to="/instruments">{copy.steps.funds.action}</Go>;
    }
  }

  return (
    <EmptyState icon={icon} title={title} body={body}>
      <ol className="w-full max-w-md divide-y divide-border-subtle rounded-card border border-border text-left">
        {steps.map((step) => {
          const Mark = step.done ? CircleCheck : Circle;
          return (
            <li
              key={step.id}
              className="flex min-h-14 items-center gap-3 px-4 py-2"
            >
              <Mark
                size={16}
                strokeWidth={1.75}
                className={`shrink-0 ${step.done ? "text-text" : "text-faint"}`}
                aria-label={step.done ? copy.done : copy.pending}
              />
              <span
                className={`flex-1 text-[13px] ${step.done ? "text-muted" : "text-text"}`}
              >
                {copy.steps[step.id].label}
              </span>
              {step.progress && (
                <span className="font-mono text-[12px] text-muted">
                  {copy.progress(step.progress.have, step.progress.need)}
                </span>
              )}
              {!step.done && action(step)}
            </li>
          );
        })}
      </ol>
    </EmptyState>
  );
}

function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass("default", "sm")}>
      {children}
    </Link>
  );
}
