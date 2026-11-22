import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  KRAKEN_CONTRACT_FILE,
  krakenContractJson,
} from "../../../test/contract/kraken-contract";

describeContract({
  name: "kraken",
  file: KRAKEN_CONTRACT_FILE,
  json: krakenContractJson,
  evaluate,
  minByHand: 10,
});
