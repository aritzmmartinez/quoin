import { RefreshCw } from "lucide-react";

import { useCopy } from "~/lib";

import { useIpcRefresh } from "../settings/use-ipc-refresh";
import { Button } from "./Button";

export function IpcSyncButton() {
  const t = useCopy();
  const { refresh, busy } = useIpcRefresh();

  return (
    <Button size="sm" onClick={refresh} disabled={busy}>
      <RefreshCw
        size={13}
        strokeWidth={1.75}
        aria-hidden
        className={busy ? "animate-spin" : undefined}
      />
      {t.basis.sync.action}
    </Button>
  );
}
