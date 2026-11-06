import { z } from "zod";

export const RESIDENCES = ["bizkaia"] as const;
export const residenceSchema = z.enum(RESIDENCES);
export type Residence = z.infer<typeof residenceSchema>;

export class UnsupportedResidenceError extends Error {
  constructor(readonly residence: string) {
    super(
      `This database holds the residence "${residence}", which this version of Quoin does not know. Update Quoin.`,
    );
    this.name = "UnsupportedResidenceError";
  }
}
