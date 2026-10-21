import { useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import type { IpcSyncResponse } from "~/routes/ipc-sync";

import { ipcSyncToast, useCopy } from "~/lib";

const ENDPOINT = "/api/ipc/sync";

type Synced = Extract<IpcSyncResponse, { ok: true }>;

async function run(error: string): Promise<Synced> {
  const response = await fetch(ENDPOINT, { method: "POST" });
  const body = (await response.json()) as IpcSyncResponse;
  if (!body.ok) throw new Error(body.error ?? error);
  if (!response.ok) throw new Error(error);
  return body;
}

export function useIpcRefresh() {
  const t = useCopy();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const copy = t.basis.sync;

  function refresh() {
    setBusy(true);
    toast.promise(run(copy.error), {
      loading: copy.loading,
      success: (result) => {
        void revalidator.revalidate();
        return ipcSyncToast(t, {
          added: result.added,
          rebaseBlocked: result.rebaseBlocked,
        });
      },
      error: (error: unknown) =>
        error instanceof Error ? error.message : copy.error,
      finally: () => setBusy(false),
    });
  }

  return { refresh, busy };
}
