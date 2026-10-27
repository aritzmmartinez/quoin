import type { Residence } from "../domain";

export interface SettingsRepository {
  residence(): Promise<Residence>;
  setResidence(residence: Residence): Promise<void>;
}
