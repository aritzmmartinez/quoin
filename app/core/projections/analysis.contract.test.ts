import { describeContract } from "../../../test/contract/check";
import {
  analysisContractJson,
  ANALYSIS_CONTRACT_FILE,
  evaluate,
} from "../../../test/contract/analysis-contract";

describeContract({
  name: "analysis",
  file: ANALYSIS_CONTRACT_FILE,
  json: analysisContractJson,
  evaluate,
  minByHand: 2,
});
