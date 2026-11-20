import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  EXPOSURE_DEFAULT_CONTRACT_FILE,
  exposureDefaultContractJson,
} from "../../../test/contract/exposure-default-contract";

describeContract({
  name: "exposure-default",
  file: EXPOSURE_DEFAULT_CONTRACT_FILE,
  json: exposureDefaultContractJson,
  evaluate,
  minByHand: 4,
});
