import { createHmac, randomBytes } from "node:crypto";

export const PAIRING_TTL_MS = 2 * 60_000;
export const CONFIRM_TTL_MS = 60_000;
export const MAX_TOKEN_ATTEMPTS = 10;

export function pairingCode(token: string, deviceId: string): string {
  const digest = createHmac("sha256", token).update(deviceId).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export const newSyncToken = (): string => randomBytes(32).toString("base64url");

export type PairingState =
  | { status: "idle" }
  | { status: "waiting"; expiresAt: number }
  | { status: "confirming"; name: string; code: string }
  | { status: "paired"; name: string }
  | { status: "rejected" }
  | { status: "expired" };

export type PairingAnswer =
  | { kind: "invalid-token" }
  | { kind: "confirmed"; deviceId: string; name: string }
  | { kind: "rejected" }
  | { kind: "expired" };

interface Session {
  token: string;
  attempts: number;
  timer: ReturnType<typeof setTimeout>;
  answer?: (answer: PairingAnswer) => void;
  deviceId?: string;
}

export class PairingRegistry {
  private session: Session | null = null;
  private current: PairingState = { status: "idle" };

  state(): PairingState {
    return this.current;
  }

  start(now: number): { token: string; expiresAt: number } {
    this.close({ kind: "expired" }, { status: "idle" });
    const expiresAt = now + PAIRING_TTL_MS;
    const token = newSyncToken();
    this.session = { token, attempts: 0, timer: this.expireIn(PAIRING_TTL_MS) };
    this.current = { status: "waiting", expiresAt };
    return { token, expiresAt };
  }

  // The scan and the confirmation have a deadline each; a phone that hangs up
  // ends the session, so nothing is confirmed for a phone that will never hear it.
  request(
    token: string,
    deviceId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<PairingAnswer> {
    const session = this.session;
    if (
      !session ||
      this.current.status !== "waiting" ||
      session.token !== token
    ) {
      if (session && ++session.attempts >= MAX_TOKEN_ATTEMPTS) {
        this.close({ kind: "expired" }, { status: "expired" });
      }
      return Promise.resolve({ kind: "invalid-token" });
    }

    session.deviceId = deviceId;
    clearTimeout(session.timer);
    session.timer = this.expireIn(CONFIRM_TTL_MS);
    this.current = {
      status: "confirming",
      name,
      code: pairingCode(token, deviceId),
    };
    const answer = new Promise<PairingAnswer>((resolve) => {
      session.answer = resolve;
    });
    const hangUp = () => {
      if (this.session === session) {
        this.close({ kind: "expired" }, { status: "expired" });
      }
    };
    if (signal?.aborted) hangUp();
    else signal?.addEventListener("abort", hangUp, { once: true });
    return answer;
  }

  confirm(): void {
    const { session, current } = this;
    if (!session?.deviceId || current.status !== "confirming") return;
    this.close(
      { kind: "confirmed", deviceId: session.deviceId, name: current.name },
      { status: "paired", name: current.name },
    );
  }

  reject(): void {
    if (this.current.status !== "confirming") return;
    this.close({ kind: "rejected" }, { status: "rejected" });
  }

  cancel(): void {
    this.close({ kind: "expired" }, { status: "idle" });
  }

  failed(): void {
    this.current = { status: "expired" };
  }

  private expireIn(ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(
      () => this.close({ kind: "expired" }, { status: "expired" }),
      ms,
    );
    timer.unref();
    return timer;
  }

  private close(answer: PairingAnswer, next: PairingState): void {
    const session = this.session;
    this.session = null;
    this.current = next;
    if (!session) return;
    clearTimeout(session.timer);
    session.answer?.(answer);
  }
}
