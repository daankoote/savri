import {
  runDocumentUploadLocalIntegrationProof,
  type DocumentDownloadEndpointProofResult,
} from "../../app/src/features/documents/documentUploadLocalIntegration.proof.ts";

export async function runAppDocumentDownloadUrlProof(): Promise<DocumentDownloadEndpointProofResult> {
  const result = await runDocumentUploadLocalIntegrationProof();
  return result.downloadProof;
}
