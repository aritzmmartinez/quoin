import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  SERIES_CONTRACT_FILE,
  seriesContractJson,
} from "../../../test/contract/series-contract";

describeContract({
  name: "series",
  file: SERIES_CONTRACT_FILE,
  json: seriesContractJson,
  evaluate,
  minByHand: 2,
});
