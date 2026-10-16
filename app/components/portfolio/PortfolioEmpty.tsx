import { Wallet } from "lucide-react";

import { useCopy } from "~/lib";
import { IngestModal } from "../ingest/IngestModal";
import { EmptyState } from "../ui/EmptyState";

export function PortfolioEmpty() {
  const t = useCopy();
  return (
    <EmptyState
      icon={Wallet}
      title={t.portfolio.empty.title}
      body={t.portfolio.empty.body}
    >
      <IngestModal variant="primary" size="md" />
    </EmptyState>
  );
}
