import { useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import type { FxSyncResponse } from "~/routes/fx-sync";

import { fxSyncToast, useCopy } from "~/lib";

const ENDPOINT = "/api/fx/sync";

export function useFxRefresh() {
  const t = useCopy();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const copy = t.fx.sync;

  async function refresh() {
    setBusy(true);
    const id = toast.loading(copy.loading);
    try {
      const response = await fetch(ENDPOINT, { method: "POST" });
      const body = (await response.json()) as FxSyncResponse;
      if (!body.ok) {
        toast.error(copy.error, { id });
        return;
      }
      const summary = fxSyncToast(t, body);
      const options = {
        id,
        ...(summary.description ? { description: summary.description } : {}),
      };
      if (summary.ok) toast.success(summary.message, options);
      else toast.error(summary.message, options);
      void revalidator.revalidate();
    } catch {
      toast.error(copy.error, { id });
    } finally {
      setBusy(false);
    }
  }

  return { refresh: () => void refresh(), busy };
}
