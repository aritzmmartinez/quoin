import { residenceSchema, type Residence } from "~/core/domain";
import type { SettingsRepository } from "~/core/ports";

import { prisma } from "./db.server";

const SETTINGS_ID = 1;

export class PrismaSettingsRepository implements SettingsRepository {
  async residence(): Promise<Residence> {
    const row = await prisma.settings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!row) throw new Error("The Settings row is missing");
    return residenceSchema.parse(row.residence);
  }

  async setResidence(residence: Residence): Promise<void> {
    const parsed = residenceSchema.parse(residence);
    await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, residence: parsed },
      update: { residence: parsed },
    });
  }
}
