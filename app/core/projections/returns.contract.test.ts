import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  RETURNS_CONTRACT_FILE,
  returnsContractJson,
} from "../../../test/contract/returns-contract";

describeContract({
  name: "returns",
  file: RETURNS_CONTRACT_FILE,
  json: returnsContractJson,
  evaluate,
  minByHand: 2,
});
