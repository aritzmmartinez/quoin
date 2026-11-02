import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  TAX_CONTRACT_FILE,
  taxContractJson,
} from "../../../test/contract/tax-contract";

describeContract({
  name: "tax",
  file: TAX_CONTRACT_FILE,
  json: taxContractJson,
  evaluate,
  minByHand: 3,
});
