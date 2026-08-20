import {
  type DocumentParserPort,
  type DocumentParserProfileKey,
  type DocumentParserProviderAdapter,
  PARSER_OBSERVATION_ENVELOPE_VERSION,
  type ParserObservationEnvelopeV1,
  type ParserObservedFactItem,
  type TrustedParserContext,
} from "./document_parser_contract.ts";
import { getDocumentParserProfile } from "./document_parser_profiles.ts";

export const DOCUMENT_PARSER_CORE_VERSION = "document_parser_core_v1";

export type CanonicalHash = (value: unknown) => Promise<string>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function assertTrustedContext(context: TrustedParserContext): void {
  if (
    context.provenanceAuthority !== "trusted_server" ||
    !context.observationRef ||
    !context.source.evidenceVersionRef ||
    !/^[0-9a-f]{64}$/.test(context.byteSha256) ||
    Number.isNaN(Date.parse(context.serverObservedAt))
  ) throw new Error("invalid_trusted_parser_context");
}

export async function buildParserExecutionIdentity(
  hashCanonical: CanonicalHash,
  input: {
    source: TrustedParserContext["source"];
    byteSha256: string;
    profile: DocumentParserProfileKey;
    profileVersion: string;
    provider: Pick<
      DocumentParserProviderAdapter,
      "adapterId" | "adapterVersion" | "configFingerprint"
    >;
  },
): Promise<string> {
  return await hashCanonical({
    byte_sha256: input.byteSha256,
    evidence_source: input.source,
    parser_core_version: DOCUMENT_PARSER_CORE_VERSION,
    parser_profile: input.profile,
    profile_version: input.profileVersion,
    provider_adapter_id: input.provider.adapterId,
    provider_adapter_version: input.provider.adapterVersion,
    provider_config_fingerprint: input.provider.configFingerprint,
  });
}

export function createDocumentParserPort(
  provider: DocumentParserProviderAdapter,
  hashCanonical: CanonicalHash,
): DocumentParserPort {
  return Object.freeze({
    async parse(
      document: Uint8Array,
      profileKey: DocumentParserProfileKey,
      context: TrustedParserContext,
    ) {
      assertTrustedContext(context);
      const profile = getDocumentParserProfile(profileKey);
      const executionIdentitySha256 = await buildParserExecutionIdentity(
        hashCanonical,
        {
          source: context.source,
          byteSha256: context.byteSha256,
          profile: profileKey,
          profileVersion: profile.version,
          provider,
        },
      );
      const extraction = await provider.extract(document);
      if (extraction.ok && extraction.contentSha256 !== context.byteSha256) {
        throw new Error("parser_document_hash_mismatch");
      }
      const allowed = new Set(profile.expectedFactKeys);
      const observedFacts: ParserObservedFactItem[] = extraction.ok
        ? extraction.factCandidates.filter((candidate) =>
          allowed.has(candidate.factKey) && candidate.displayable &&
          Boolean(candidate.normalizedValue)
        ).map((candidate) => ({
          factKey: candidate.factKey,
          status: "observed" as const,
          observedValue: candidate.rawValue,
          normalizedObservedValue: candidate.normalizedValue,
          ...(candidate.structuredAddress
            ? { structuredAddress: candidate.structuredAddress }
            : {}),
          sourceLocator: {
            page: candidate.sourcePage,
            region: candidate.sourceRegion,
            extractionMethod: candidate.extractionMethod,
          },
          confidence: candidate.confidence,
          limitation: null,
        }))
        : [];
      const observedKeys = new Set(observedFacts.map((item) => item.factKey));
      for (const factKey of profile.requiredObservationKeys) {
        if (!observedKeys.has(factKey)) {
          observedFacts.push({
            factKey,
            status: "not_observed",
            observedValue: null,
            normalizedObservedValue: null,
            sourceLocator: null,
            confidence: "unavailable",
            limitation: `${factKey}_not_observed`,
          });
        }
      }
      const limitations = extraction.ok
        ? [
          ...new Set([
            ...extraction.limitations,
            ...observedFacts.flatMap((item) => item.limitation ? [item.limitation] : []),
          ]),
        ]
        : [extraction.limitation];
      const outcome = extraction.ok
        ? limitations.length > 0
          ? "completed_with_limitations" as const
          : "completed" as const
        : "failed" as const;
      const envelopeWithoutHash = {
        envelopeVersion: PARSER_OBSERVATION_ENVELOPE_VERSION,
        provenanceAuthority: "trusted_server" as const,
        observationRef: context.observationRef,
        evidenceSource: context.source,
        byteSha256: context.byteSha256,
        parserCoreVersion: DOCUMENT_PARSER_CORE_VERSION,
        parserProfile: profile.key,
        profileVersion: profile.version,
        providerAdapterId: provider.adapterId,
        providerAdapterVersion: provider.adapterVersion,
        providerConfigFingerprint: provider.configFingerprint,
        serverObservedAt: context.serverObservedAt,
        pageCount: extraction.ok ? extraction.pageCount : 0,
        documentTypeCandidates: extraction.ok
          ? extraction.documentTypeCandidates
          : [],
        observedFacts,
        outcome,
        limitations,
        executionIdentitySha256,
      };
      const envelope: ParserObservationEnvelopeV1 = {
        ...envelopeWithoutHash,
        envelopeHash: await hashCanonical(envelopeWithoutHash),
      };
      return deepFreeze(envelope);
    },
  });
}
