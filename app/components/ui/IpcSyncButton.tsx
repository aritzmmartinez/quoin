import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import { ipcSyncToast, useCopy } from "~/lib";
import type { IpcSyncResponse } from "~/routes/ipc-sync";

import { Button } from "./Button";

const ENDPOINT = "/api/ipc/sync";

type Synced = Extract<IpcSyncResponse, { ok: true }>;

async function run(error: string): Promise<Synced> {
  const response = await fetch(ENDPOINT, { method: "POST" });
  const body = (await response.json()) as IpcSyncResponse;
  if (!response.ok || !body.ok) throw new Error(error);
  return body;
}

export function IpcSyncButton() {
  const t = useCopy();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const copy = t.basis.sync;

  function onClick() {
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
