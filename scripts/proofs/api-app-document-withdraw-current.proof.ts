import {
  runDocumentUploadLocalIntegrationProof,
  type DocumentWithdrawEndpointProofResult,
} from "../../app/src/features/documents/documentUploadLocalIntegration.proof.ts";

export async function runAppDocumentWithdrawCurrentProof(): Promise<DocumentWithdrawEndpointProofResult> {
  const result = await runDocumentUploadLocalIntegrationProof();
  return result.withdrawalProof;
}
