import {
  type DocumentParserPort,
  type DocumentParserProfileKey,
  type DocumentParserProviderAdapter,
  PARSER_OBSERVATION_ENVELOPE_VERSION,
  type ParserObservationEnvelopeV1,
  type ParserObservedFactItem,
  type ParserProviderFactCandidate,
  type TrustedParserContext,
} from "./document_parser_contract.ts";
import { getDocumentParserProfile } from "./document_parser_profiles.ts";
import { isDocumentFactKey } from "./document_fact_vocabulary.ts";

export const DOCUMENT_PARSER_CORE_VERSION = "document_parser_core_v1";

export type CanonicalHash = (value: unknown) => Promise<string>;

const SEMANTIC_UNEXPECTED_FACT_METHODS: Readonly<
  Partial<Record<ParserProviderFactCandidate["factKey"], readonly string[]>>
> = Object.freeze({
  partyName: Object.freeze([
    "semantic_contract_holder_block",
    "invoice_customer_block",
  ]),
  structuredAddress: Object.freeze([
    "semantic_delivery_address_block",
    "explicit_delivery_address_block",
    "explicit_installation_address_block",
    "invoice_address_block",
  ]),
  electricityEan: Object.freeze(["ean_context"]),
  gasEan: Object.freeze(["ean_context"]),
  energySupplier: Object.freeze(["semantic_supplier_block"]),
  contractStart: Object.freeze(["contract_period"]),
  contractEnd: Object.freeze(["contract_period"]),
  installerOrSupplier: Object.freeze(["invoice_supplier_field"]),
  chargerBrand: Object.freeze(["invoice_labeled_field"]),
  chargerModel: Object.freeze(["invoice_labeled_field"]),
  midNumber: Object.freeze(["invoice_labeled_field"]),
  serialNumber: Object.freeze(["invoice_labeled_field"]),
  invoiceDate: Object.freeze([
    "explicit_invoice_date",
    "labeled_document_date",
  ]),
  explicitInstallationDate: Object.freeze(["explicit_installation_date"]),
});

const ORGANIZATION_FACT_KEYS = new Set<ParserProviderFactCandidate["factKey"]>([
  "organizationName",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
  "kvkNumber",
]);

function semanticallyReliableUnexpectedCandidate(
  candidate: ParserProviderFactCandidate,
): boolean {
  if (
    candidate.confidence === "low" || candidate.confidence === "unavailable"
  ) return false;
  if (
    ORGANIZATION_FACT_KEYS.has(candidate.factKey) &&
    candidate.extractionMethod.startsWith("organization_extract_")
  ) return true;
  return SEMANTIC_UNEXPECTED_FACT_METHODS[candidate.factKey]?.includes(
    candidate.extractionMethod,
  ) === true;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
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
      const expected = new Set(profile.expectedFactKeys);
      const retainUnexpected = profile.unexpectedObservationPolicy ===
        "retain_semantically_reliable_v1";
      const eligibleCandidates = extraction.ok
        ? extraction.factCandidates.filter((candidate) =>
          isDocumentFactKey(candidate.factKey) && candidate.displayable &&
          Boolean(candidate.normalizedValue) &&
          (expected.has(candidate.factKey) ||
            (retainUnexpected &&
              semanticallyReliableUnexpectedCandidate(candidate)))
        )
        : [];
      const canonicalCandidates = [
        ...new Set(
          eligibleCandidates.map((candidate) => candidate.factKey),
        ),
      ].flatMap((factKey) => {
        const candidates = eligibleCandidates.filter((candidate) =>
          candidate.factKey === factKey
        );
        const values = new Set(
          candidates.map((candidate) => candidate.normalizedValue),
        );
        return values.size === 1 ? [candidates[0]] : [];
      });
      const ambiguousFactKeys = [
        ...new Set(
          eligibleCandidates.map((candidate) => candidate.factKey),
        ),
      ].filter((factKey) =>
        new Set(
          eligibleCandidates.filter((candidate) =>
            candidate.factKey === factKey
          )
            .map((candidate) => candidate.normalizedValue),
        ).size > 1
      );
      const observedFacts: ParserObservedFactItem[] = canonicalCandidates.map((
        candidate,
      ) => ({
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
      }));
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
            ...observedFacts.flatMap((item) =>
              item.limitation ? [item.limitation] : []
            ),
            ...ambiguousFactKeys.map((factKey) =>
              `${factKey}_ambiguous_observation`
            ),
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
