import { describeContract } from "../../../test/contract/check";
import {
  CARRYFORWARD_CONTRACT_FILE,
  carryforwardContractJson,
  evaluate,
} from "../../../test/contract/carryforward-contract";

describeContract({
  name: "carryforward",
  file: CARRYFORWARD_CONTRACT_FILE,
  json: carryforwardContractJson,
  evaluate,
  minByHand: 5,
});
