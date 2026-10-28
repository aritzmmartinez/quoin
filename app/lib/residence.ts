import { zoneOfResidence } from "~/core/calendar";
import type { Residence } from "~/core/domain";
import { jurisdictionOf, type Jurisdiction } from "~/core/tax";

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
