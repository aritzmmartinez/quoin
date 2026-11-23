import type { Residence } from "../domain/residence";

const ZONES: Record<Residence, string> = {
  bizkaia: "Europe/Madrid",
  comun: "Europe/Madrid",
  canarias: "Atlantic/Canary",
};

export function zoneOfResidence(residence: Residence): string {
  return ZONES[residence];
}
