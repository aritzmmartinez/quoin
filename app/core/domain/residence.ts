import { z } from "zod";

/**
 * Where the owner is tax resident. Not a territory and not a zone: the régimen
 * común will be one territory spanning two zones (Canarias runs an hour behind).
 */
export const RESIDENCES = ["bizkaia"] as const;
export const residenceSchema = z.enum(RESIDENCES);
export type Residence = z.infer<typeof residenceSchema>;
