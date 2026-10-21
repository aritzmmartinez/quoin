import { RefreshCw } from "lucide-react";

import { useCopy } from "~/lib";

import {
  usePriceRefresh,
  type PriceRefreshTarget,
} from "../settings/use-price-refresh";
import { Button } from "../ui/Button";

export type SyncPricesTarget = PriceRefreshTarget;

export function SyncPricesButton({
  targets,
  unmapped,
}: {
  targets: readonly SyncPricesTarget[];
  unmapped: { open: number; closed: number };
}) {
  const t = useCopy();
  const { refresh, busy } = usePriceRefresh(targets, unmapped);

  return (
    <Button size="sm" onClick={refresh} disabled={busy}>
      <RefreshCw
        size={13}
        strokeWidth={1.75}
        aria-hidden
        className={busy ? "animate-spin" : undefined}
      />
      {t.instruments.sync.action}
    </Button>
  );
}
