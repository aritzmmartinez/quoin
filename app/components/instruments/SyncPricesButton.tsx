import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import type { PriceSyncResponse } from "~/routes/prices-sync";

import { priceSyncToast, useCopy } from "~/lib";
import { Button } from "../ui/Button";

const ENDPOINT = "/api/prices/sync";

type Synced = Extract<PriceSyncResponse, { ok: true }>;

async function run(error: string): Promise<Synced> {
  const response = await fetch(ENDPOINT, { method: "POST" });
  const body = (await response.json()) as PriceSyncResponse;
  if (!response.ok || !body.ok) throw new Error(error);
  return body;
}

export function SyncPricesButton() {
  const t = useCopy();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const copy = t.instruments.sync;

  function onClick() {
    setBusy(true);
    toast.promise(run(copy.error), {
      loading: copy.loading,
      success: (result) => {
        void revalidator.revalidate();
        return priceSyncToast(t, result);
      },
      error: copy.error,
      finally: () => setBusy(false),
    });
  }

  return (
    <Button size="sm" onClick={onClick} disabled={busy}>
      <RefreshCw
        size={13}
        strokeWidth={1.75}
        aria-hidden
        className={busy ? "animate-spin" : undefined}
      />
      {copy.action}
    </Button>
  );
}
