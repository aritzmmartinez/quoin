import { describeContract } from "../../../test/contract/check";
import {
  evaluate,
  SYNC_PRICES_CONTRACT_FILE,
  syncPricesContractJson,
} from "../../../test/contract/sync-prices-contract";

describeContract({
  name: "sync-prices",
  file: SYNC_PRICES_CONTRACT_FILE,
  json: syncPricesContractJson,
  evaluate,
  minByHand: 2,
});
