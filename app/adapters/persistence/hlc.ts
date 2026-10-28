import { tick } from "~/core/sync";

import type { Prisma } from "./generated/client";

const DEVICE_ID = 1;

/**
 * Issue the next sync mark of this database, inside the caller's transaction, so
 * a write and its mark land together or not at all.
 */
export async function stamp(tx: Prisma.TransactionClient): Promise<string> {
  const device = await tx.syncDevice.findUnique({ where: { id: DEVICE_ID } });
  if (!device) throw new Error("The SyncDevice row is missing");
  const hlc = tick(device.lastHlc, Date.now(), device.deviceId);
  await tx.syncDevice.update({
    where: { id: DEVICE_ID },
    data: { lastHlc: hlc },
  });
  return hlc;
}
