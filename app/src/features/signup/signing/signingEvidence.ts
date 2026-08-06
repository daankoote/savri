import type {
  SignatureChallengeType,
  SignatureMethodId,
} from "./signatureMethod";

export type SigningEvidenceEnvelope = {
  evidenceVersion: "signing-evidence-v1";
  methodId: SignatureMethodId;
  methodVersion: string;
  challengeType: SignatureChallengeType;
  otpChallengeId: string;
  otpVerifiedAt: string;
  verifiedCommunicationChannelReference: string;
  typedName: string;
  signerRole: string;
  intentVersion: string;
  canonicalSnapshotHash: string;
  legalDocumentHashes: Record<string, string>;
  auditEvidenceReference: string;
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function validateSigningEvidenceEnvelope(
  evidence: SigningEvidenceEnvelope,
  expected: { methodId: SignatureMethodId; methodVersion: string },
): boolean {
  return evidence.evidenceVersion === "signing-evidence-v1" &&
    evidence.methodId === expected.methodId &&
    evidence.methodVersion === expected.methodVersion &&
    evidence.challengeType === "otp" &&
    Boolean(evidence.otpChallengeId.trim()) &&
    Boolean(evidence.otpVerifiedAt.trim()) &&
    Boolean(evidence.verifiedCommunicationChannelReference.trim()) &&
    Boolean(evidence.typedName.trim()) &&
    Boolean(evidence.intentVersion.trim()) &&
    SHA256_HEX.test(evidence.canonicalSnapshotHash) &&
    Object.keys(evidence.legalDocumentHashes).length > 0 &&
    Object.values(evidence.legalDocumentHashes).every((hash) =>
      SHA256_HEX.test(hash)
    ) && Boolean(evidence.auditEvidenceReference.trim());
}
