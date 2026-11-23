import { zoneOfResidence } from "~/core/calendar";
import {
  residenceSchema,
  UnsupportedResidenceError,
  type Residence,
} from "~/core/domain";
import { jurisdictionOf, type Jurisdiction } from "~/core/tax";

export const UNSUPPORTED_RESIDENCE = "unsupported-residence";

export function isUnsupportedResidence(error: unknown): boolean {
  if (error instanceof UnsupportedResidenceError) return true;
  const data = (error as { data?: { code?: unknown } } | null | undefined)
    ?.data;
  return data?.code === UNSUPPORTED_RESIDENCE;
}

/**
 * The zone a sync backup's day is named in. A residence this version does not
 * know still gets its backup, named in UTC: a file name is no reason to skip
 * one.
 */
export function backupZoneOf(residence: string): string {
  const parsed = residenceSchema.safeParse(residence);
  return parsed.success ? zoneOfResidence(parsed.data) : "UTC";
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
