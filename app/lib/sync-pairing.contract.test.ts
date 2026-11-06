import { describeContract } from "../../test/contract/check";
import {
  evaluate,
  SYNC_PAIRING_CONTRACT_FILE,
  syncPairingContractJson,
} from "../../test/contract/sync-pairing-contract";

describeContract({
  name: "sync-pairing",
  file: SYNC_PAIRING_CONTRACT_FILE,
  json: syncPairingContractJson,
  evaluate,
  minByHand: 4,
});
