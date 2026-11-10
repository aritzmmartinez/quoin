import { inspect } from "node:util";

import { data } from "react-router";

import { PrismaSettingsRepository } from "~/adapters/persistence";
import { UnsupportedResidenceError } from "~/core/domain";

import {
  residenceContext,
  UNSUPPORTED_RESIDENCE,
  type ResidenceContext,
} from "./residence";

function unsupportedResidence(error: UnsupportedResidenceError) {
  return Object.assign(data({ code: UNSUPPORTED_RESIDENCE }, { status: 409 }), {
    toString: () => error.message,
    [inspect.custom]: () => error.message,
  });
}

export async function loadResidence(): Promise<ResidenceContext> {
  try {
    return residenceContext(await new PrismaSettingsRepository().residence());
  } catch (error) {
    if (error instanceof UnsupportedResidenceError) {
      throw unsupportedResidence(error);
    }
    throw error;
  }
}
