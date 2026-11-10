import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  REALIZED_CONTRACT_FILE,
  realizedContractJson,
} from "../../../test/contract/realized-contract";

describeContract({
  name: "realized",
  file: REALIZED_CONTRACT_FILE,
  json: realizedContractJson,
  evaluate,
  minByHand: 2,
});
