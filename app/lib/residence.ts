import { zoneOfResidence } from "~/core/calendar";
import { UnsupportedResidenceError, type Residence } from "~/core/domain";
import { jurisdictionOf, type Jurisdiction } from "~/core/tax";

export const UNSUPPORTED_RESIDENCE = "unsupported-residence";

export function isUnsupportedResidence(error: unknown): boolean {
  if (error instanceof UnsupportedResidenceError) return true;
  const data = (error as { data?: { code?: unknown } } | null | undefined)
    ?.data;
  return data?.code === UNSUPPORTED_RESIDENCE;
}

export interface ResidenceContext {
  residence: Residence;
  jurisdiction: Jurisdiction;
  calendarZone: string;
  displayZone: string;
}

export function residenceContext(residence: Residence): ResidenceContext {
  const calendarZone = zoneOfResidence(residence);
  return {
    residence,
    jurisdiction: jurisdictionOf(residence),
    calendarZone,
    displayZone: calendarZone,
  };
}
