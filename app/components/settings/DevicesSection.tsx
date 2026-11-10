import { Laptop, Network, QrCode, Smartphone, Unplug } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/components/ui/Button";
import { Modal } from "~/components/ui/Modal";
import {
  formatCountdown,
  parsePort,
  parseServerName,
  summarizeLastSync,
  useCopy,
  useFormat,
  type Copy,
  type DeviceView,
  type DevicesError,
  type DevicesPoll,
  type DevicesResponse,
  type DevicesView,
} from "~/lib";
import type { PairingState } from "~/lib/sync-pairing";

import { SettingRow as Row } from "./SettingRow";

const ENDPOINT = "/api/devices";
const POLL_MS = 1000;
const LIST_REFRESH_MS = 15_000;
const FIELD =
  "w-48 max-w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px]";

type DevicesCopy = Copy["settings"]["devices"];

function errorText(
  copy: DevicesCopy,
  response: DevicesResponse | undefined,
): string | null {
  if (!response || response.ok) return null;
  const texts: Record<DevicesError, string> = {
    "invalid-host": copy.address.invalidHost,
    "invalid-port": copy.address.invalidPort,
    "invalid-name": copy.name.invalid,
    "need-address": copy.pair.needAddress,
    "port-unavailable": copy.pair.portUnavailable(response.port ?? 0),
    refused: copy.refused,
  };
  return texts[response.error];
}

function Failure({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span role="alert" className="text-[11px] text-negative">
      {text}
    </span>
  );
}

function useSavedToast(data: DevicesResponse | undefined, text: string) {
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    if (data?.ok) toast.success(latest.current);
  }, [data]);
}

function useLiveDevices(initial: DeviceView[]): DeviceView[] {
  const fetcher = useFetcher<DevicesPoll>();
  const load = useRef(fetcher.load);
  load.current = fetcher.load;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load.current(ENDPOINT);
    };
    const timer = setInterval(refresh, LIST_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return fetcher.data?.devices ?? initial;
}

export function DevicesSection({ view }: { view: DevicesView }) {
  const copy = useCopy().settings.devices;
  const devices = useLiveDevices(view.devices);

  return (
    <>
      <NameForm copy={copy} view={view} />
      <HostForm copy={copy} view={view} />
      <PortForm copy={copy} view={view} />
      <Pairing copy={copy} />
      <DeviceList copy={copy} devices={devices} />
    </>
  );
}

function FieldForm({
  intent,
  dirty,
  saved,
  icon,
  label,
  hint,
  children,
  copy,
}: {
  intent: string;
  dirty: boolean;
  saved: string;
  icon: typeof Laptop;
  label: string;
  hint: string;
  children: ReactNode;
  copy: DevicesCopy;
}) {
  const fetcher = useFetcher<DevicesResponse>();
  useSavedToast(fetcher.data, saved);
  return (
    <fetcher.Form
      method="post"
      action={ENDPOINT}
      className="not-first:border-t not-first:border-border-subtle"
    >
      <input type="hidden" name="intent" value={intent} />
      <Row
        icon={icon}
        label={label}
        hint={hint}
        detail={<Failure text={errorText(copy, fetcher.data)} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <Button
            type="submit"
            size="sm"
            disabled={!dirty || fetcher.state !== "idle"}
          >
            {copy.address.save}
          </Button>
        </div>
      </Row>
    </fetcher.Form>
  );
}

function NameForm({ copy, view }: { copy: DevicesCopy; view: DevicesView }) {
  const [name, setName] = useState(view.name ?? "");
  return (
    <FieldForm
      intent="save-name"
      dirty={parseServerName(name) !== view.name}
      saved={copy.saved.name}
      icon={Laptop}
      label={copy.name.label}
      hint={copy.name.hint}
      copy={copy}
    >
      <input
        name="name"
        aria-label={copy.name.label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={view.defaultName}
        className={FIELD}
      />
    </FieldForm>
  );
}

function HostForm({ copy, view }: { copy: DevicesCopy; view: DevicesView }) {
  const { host: text } = copy.address;
  const shown = view.host ?? view.proposals[0] ?? "";
  const [host, setHost] = useState(shown);
  return (
    <FieldForm
      intent="save-host"
      dirty={host.trim() !== shown}
      saved={copy.saved.host}
      icon={Network}
      label={text.label}
      hint={view.proposals.length === 0 ? text.hintManual : text.hint}
      copy={copy}
    >
      <input
        name="host"
        aria-label={text.label}
        list="sync-host-proposals"
        value={host}
        onChange={(event) => setHost(event.target.value)}
        placeholder={text.placeholder}
        className={`${FIELD} font-mono`}
      />
      <datalist id="sync-host-proposals">
        {view.proposals.map((proposal) => (
          <option key={proposal} value={proposal} />
        ))}
      </datalist>
    </FieldForm>
  );
}

function PortForm({ copy, view }: { copy: DevicesCopy; view: DevicesView }) {
  const { port: text } = copy.address;
  const [port, setPort] = useState(String(view.port));
  return (
    <FieldForm
      intent="save-port"
      dirty={parsePort(port) !== view.port}
      saved={copy.saved.port}
      icon={Unplug}
      label={text.label}
      hint={
        view.database
          ? `${text.hint} · ${text.database(view.database.path, view.database.kind)}`
          : text.hint
      }
      copy={copy}
    >
      <input
        name="port"
        aria-label={text.label}
        inputMode="numeric"
        value={port}
        onChange={(event) => setPort(event.target.value)}
        className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[13px]"
      />
    </FieldForm>
  );
}

const isOpen = (state: PairingState) =>
  state.status === "waiting" || state.status === "confirming";

function Pairing({ copy }: { copy: DevicesCopy }) {
  const act = useFetcher<DevicesResponse>();
  const poll = useFetcher<DevicesPoll>();
  const pollLoad = useRef(poll.load);
  pollLoad.current = poll.load;
  const [state, setState] = useState<PairingState>({ status: "idle" });
  const [session, setSession] = useState<{
    svg: string;
    deadline: number;
  } | null>(null);
  const [now, setNow] = useState(0);

  const response = act.data;
  useEffect(() => {
    if (!response?.ok) return;
    if (response.pairing) {
      const current = Date.now();
      setNow(current);
      setSession({
        svg: response.pairing.svg,
        deadline: current + response.pairing.expiresInMs,
      });
    }
    const next = response.state;
    if (!next) return;
    setState(next);
    if (next.status === "paired") toast.success(copy.pair.done(next.name));
    if (next.status === "rejected") toast(copy.pair.rejected);
  }, [response, copy]);

  const polled = poll.data?.state;
  useEffect(() => {
    if (polled) setState(polled);
  }, [polled]);

  const open = isOpen(state);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void pollLoad.current(ENDPOINT);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open]);

  const send = (intent: string) =>
    void act.submit({ intent }, { method: "post", action: ENDPOINT });

  const busy = act.state !== "idle";

  return (
    <Row
      icon={QrCode}
      label={copy.pair.start}
      detail={
        <>
          <Failure text={errorText(copy, response)} />
          {state.status === "waiting" && session && (
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-[12px] text-body">{copy.pair.scan}</p>
              <div
                role="img"
                aria-label={copy.pair.qrLabel}
                className="w-56 rounded-md bg-white p-2"
                dangerouslySetInnerHTML={{ __html: session.svg }}
              />
              <p className="font-mono text-[12px] text-muted">
                {copy.pair.expiresIn(formatCountdown(session.deadline - now))}
              </p>
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => send("pair-cancel")}
                >
                  {copy.pair.cancel}
                </Button>
              </div>
            </div>
          )}
          {state.status === "confirming" && (
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-[13px] font-medium">
                {copy.pair.confirmTitle(state.name)}
              </p>
              <p className="text-[12px] text-body">{copy.pair.confirmBody}</p>
              <p className="text-[12px] text-muted">
                {copy.pair.code}{" "}
                <span className="font-mono text-[20px] font-semibold tracking-widest text-text">
                  {state.code}
                </span>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => send("pair-confirm")}
                >
                  {copy.pair.confirm}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => send("pair-reject")}
                >
                  {copy.pair.reject}
                </Button>
              </div>
            </div>
          )}
          {state.status === "expired" && (
            <p role="status" className="text-[12px] text-muted">
              {copy.pair.expired}
            </p>
          )}
        </>
      }
    >
      {!open && (
        <Button size="sm" disabled={busy} onClick={() => send("pair-start")}>
          {state.status === "expired" ? copy.pair.again : copy.pair.start}
        </Button>
      )}
    </Row>
  );
}

function DeviceList({
  copy,
  devices,
}: {
  copy: DevicesCopy;
  devices: readonly DeviceView[];
}) {
  const format = useFormat();
  const fetcher = useFetcher<DevicesResponse>();
  const dialog = useRef<HTMLDialogElement>(null);
  const [revoking, setRevoking] = useState<DeviceView | null>(null);
  useSavedToast(fetcher.data, copy.saved.revoked(revoking?.name ?? ""));

  if (devices.length === 0) {
    return (
      <p className="border-t border-border-subtle px-4 py-3 text-[12px] text-muted">
        {copy.list.empty}
      </p>
    );
  }

  return (
    <>
      {devices.map((device) => {
        const summary = summarizeLastSync(device.lastCounts, copy.counts);
        return (
          <Row
            key={device.deviceId}
            icon={Smartphone}
            label={device.name}
            hint={copy.list.pairedAt(format.formatInstant(device.pairedAt))}
            detail={
              device.revokedAt ? (
                <span className="text-[11px] text-muted">
                  {copy.list.revoked(format.formatInstant(device.revokedAt))}
                </span>
              ) : (
                <>
                  <span className="text-[11px] text-muted">
                    {device.lastSyncAt
                      ? copy.list.lastSync(
                          format.formatInstant(device.lastSyncAt),
                          device.lastAddress ?? "",
                        )
                      : copy.list.neverSynced}
                  </span>
                  {device.lastSyncAt && (
                    <span className="text-[11px] text-muted">
                      {summary.changes.join(", ")}
                    </span>
                  )}
                  {summary.failedPrices > 0 && (
                    <span className="text-[11px] text-negative">
                      {copy.failedPrices(summary.failedPrices)}
                    </span>
                  )}
                  {summary.failedRates > 0 && (
                    <span className="text-[11px] text-negative">
                      {copy.failedRates(summary.failedRates)}
                    </span>
                  )}
                </>
              )
            }
          >
            {!device.revokedAt && (
              <Button
                size="sm"
                onClick={() => {
                  setRevoking(device);
                  dialog.current?.showModal();
                }}
              >
                {copy.list.revoke}
              </Button>
            )}
          </Row>
        );
      })}
      <Modal ref={dialog} title={copy.list.revoke}>
        <div className="py-4 text-[13px]">
          <p className="text-body">
            {revoking && copy.list.confirmRevoke(revoking.name)}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dialog.current?.close()}
            >
              {copy.pair.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (revoking) {
                  void fetcher.submit(
                    { intent: "revoke", deviceId: revoking.deviceId },
                    { method: "post", action: ENDPOINT },
                  );
                }
                dialog.current?.close();
              }}
            >
              {copy.list.revoke}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
