import { PrismaSettingsRepository } from "~/adapters/persistence";

import { residenceContext, type ResidenceContext } from "./residence";

export async function loadResidence(): Promise<ResidenceContext> {
  return residenceContext(await new PrismaSettingsRepository().residence());
}
