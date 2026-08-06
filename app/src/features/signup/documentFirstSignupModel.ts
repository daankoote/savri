import type { CachedDocumentObservation } from "../invoice-analysis/documentObservationEnvelope";
import { createFreshSignupDraft } from "./signupAccountTypeTransition";
import {
  createAddressDraft,
  createChargerDraft,
  createClientId,
  createConnectionDeclarationDraft,
  createDocumentDraftsForCharger,
  createLocationDraft,
} from "./signupNormalizers";
import type {
  AccountDocumentDraft,
  AccountType,
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  ConnectionDeclarationDraft,
  ConsentDraft,
  DocumentsByChargerId,
  LocationDocumentDraft,
  SignupDraft,
  SignupLocationDraft,
} from "./signupTypes";
import {
  projectChargerDocumentObservation,
  projectEnergyDocumentObservation,
} from "./documentSemanticProjector";
import type {
  DocumentFactKey,
  DocumentFactObservation,
  DocumentSourceType,
} from "./documentFactRegistry";
import { invalidateDocumentConfirmations } from "./documentFactConfirmation";
import type {
  DocumentFactCorrectionType,
  DocumentFactDecisionStatus,
} from "./documentFactDecisionPolicy";

export type DocumentFirstAccountBasis = {
  accountType: AccountType;
  email: string;
};

export type DocumentFirstLegalParty = {
  firstName: string;
  lastName: string;
  legalName: string;
  kvkNumber: string;
};

export type DocumentFirstContactRole = {
  kind: "unassigned";
};

export type DocumentFirstLocation = {
  clientId: string;
  address: AddressDraft;
};

export type DocumentFirstCharger = ChargerDraft & {
  locationClientId: string;
};

export type DocumentFirstFactValue = string | AddressDraft;

export type DocumentFirstConfirmation = {
  factKey: DocumentFactKey;
  scopeKey: string;
  canonicalValue: DocumentFirstFactValue;
  value: DocumentFirstFactValue;
  source: "observed" | "manual";
  sourceDocuments: ReadonlyArray<{
    documentId: string;
    documentType: DocumentSourceType;
  }>;
  confirmationStatus: "confirmed";
  confirmedAt: string;
  correctedManually: boolean;
  decisionStatus: DocumentFactDecisionStatus;
  normalizationApplied: boolean;
  pendingPersistence: boolean;
};

export type DocumentFirstManualCorrection = {
  factKey: DocumentFactKey;
  scopeKey: string;
  canonicalValue: DocumentFirstFactValue;
  value: DocumentFirstFactValue;
  sourceDocumentId: string;
  sourceDocumentType: DocumentSourceType;
  observedFact: DocumentFactObservation | null;
  correctionType: DocumentFactCorrectionType;
  confirmedAt: string;
  correctedManually: true;
  pendingPersistence: boolean;
};

export type DocumentFirstParserObservations = {
  byDocumentId: Record<string, CachedDocumentObservation>;
};

export type DocumentFirstSignupDraft = {
  accountBasis: DocumentFirstAccountBasis;
  organizationDocument: AccountDocumentDraft;
  legalParty: DocumentFirstLegalParty;
  contactRole: DocumentFirstContactRole;
  locationOrder: string[];
  locationsById: Record<string, DocumentFirstLocation>;
  energyDocumentsByLocationId: Record<string, LocationDocumentDraft>;
  connectionDeclarationsByLocationId: Record<
    string,
    ConnectionDeclarationDraft
  >;
  chargerOrderByLocationId: Record<string, string[]>;
  chargersById: Record<string, DocumentFirstCharger>;
  chargerDocumentsByChargerId: DocumentsByChargerId;
  parserObservations: DocumentFirstParserObservations;
  customerConfirmations: Record<string, DocumentFirstConfirmation>;
  manualCorrections: Record<string, DocumentFirstManualCorrection>;
  rejectedFactKeys: Record<string, true>;
  acceptances: ConsentDraft;
};

export type DocumentFirstSignupAction =
  | { type: "replace_draft"; value: DocumentFirstSignupDraft }
  | { type: "invalidate_quarantine_receipts" }
  | {
    type: "update_account_basis";
    value: DocumentFirstAccountBasis;
  }
  | {
    type: "update_legal_party";
    value: DocumentFirstLegalParty;
  }
  | { type: "update_organization_document"; document: AccountDocumentDraft }
  | { type: "add_location" }
  | { type: "remove_location"; locationId: string }
  | { type: "add_charger"; locationId: string }
  | { type: "remove_charger"; locationId: string; chargerId: string }
  | { type: "update_charger"; charger: DocumentFirstCharger }
  | { type: "update_energy_document"; document: LocationDocumentDraft }
  | {
    type: "update_connection_declaration";
    locationId: string;
    value: ConnectionDeclarationDraft;
  }
  | {
    type: "set_document_observation";
    documentId: string;
    value: CachedDocumentObservation | null;
  }
  | { type: "update_charger_document"; document: ChargerDocumentDraft }
  | {
    type: "confirm_fact";
    factKey: string;
    canonicalFactKey: DocumentFactKey;
    value: DocumentFirstFactValue;
    sourceDocuments: ReadonlyArray<{
      documentId: string;
      documentType: DocumentSourceType;
    }>;
    confirmedAt: string;
    decisionStatus: DocumentFactDecisionStatus;
    normalizationApplied: boolean;
    pendingPersistence: boolean;
  }
  | { type: "reject_fact"; factKey: string }
  | {
    type: "set_manual_correction";
    factKey: string;
    canonicalFactKey: DocumentFactKey;
    value: DocumentFirstFactValue;
    sourceDocumentId: string;
    sourceDocumentType: DocumentSourceType;
    observedFact: DocumentFactObservation | null;
    correctionType: DocumentFactCorrectionType;
    confirmedAt: string;
    pendingPersistence: boolean;
  }
  | { type: "clear_manual_correction"; factKey: string }
  | { type: "update_acceptances"; value: ConsentDraft };

export const locationFactKey = (locationId: string, fact: string) =>
  `location:${locationId}:${fact}`;

export const chargerFactKey = (chargerId: string, fact: string) =>
  `charger:${chargerId}:${fact}`;

export function createOrganizationDocumentDraft(): AccountDocumentDraft {
  return {
    clientId: createClientId("doc_organization"),
    accountScope: "account",
    documentType: "organization_extract",
    file: null,
    status: "empty",
    quarantineStatus: "idle",
    quarantineFileReference: null,
    quarantineRevision: null,
    parseStatus: "idle",
  };
}

function cleanChargerForDocumentFirst(
  charger: ChargerDraft,
  locationClientId: string,
): DocumentFirstCharger {
  return {
    ...charger,
    locationClientId,
    installationYear: "",
    backendSupplier: "",
    manualBackendSupplier: "",
    solarPanelStatus: "",
  };
}

function stripChargerObservation(
  document: ChargerDocumentDraft,
): ChargerDocumentDraft {
  return { ...document, observation: null };
}

export function createDocumentFirstSignupDraftFromLegacy(
  legacy: SignupDraft,
): DocumentFirstSignupDraft {
  const locationsById: Record<string, DocumentFirstLocation> = {};
  const energyDocumentsByLocationId: Record<string, LocationDocumentDraft> = {};
  const connectionDeclarationsByLocationId: Record<
    string,
    ConnectionDeclarationDraft
  > = {};
  const chargerOrderByLocationId: Record<string, string[]> = {};
  const chargersById: Record<string, DocumentFirstCharger> = {};
  const chargerDocumentsByChargerId: DocumentsByChargerId = {};

  legacy.locations.forEach((location) => {
    locationsById[location.clientId] = {
      clientId: location.clientId,
      address: location.address,
    };
    energyDocumentsByLocationId[location.clientId] = location.energyDocument;
    connectionDeclarationsByLocationId[location.clientId] =
      location.connectionDeclaration;
    chargerOrderByLocationId[location.clientId] = location.chargers.map(
      (charger) => charger.clientId,
    );

    location.chargers.forEach((charger) => {
      chargersById[charger.clientId] = cleanChargerForDocumentFirst(
        charger,
        location.clientId,
      );
      const documents = legacy.documentsByChargerId[charger.clientId] || [];
      chargerDocumentsByChargerId[charger.clientId] = documents.map(
        stripChargerObservation,
      );
    });
  });

  const accountType = legacy.personalInfo.accountType;
  return {
    accountBasis: {
      accountType,
      email: legacy.personalInfo.email,
    },
    organizationDocument: createOrganizationDocumentDraft(),
    legalParty: {
      firstName: legacy.personalInfo.firstName,
      lastName: legacy.personalInfo.lastName,
      legalName: accountType === "vve"
        ? legacy.personalInfo.organizationName
        : legacy.personalInfo.companyName,
      kvkNumber: legacy.personalInfo.kvkNumber,
    },
    contactRole: { kind: "unassigned" },
    locationOrder: legacy.locations.map((location) => location.clientId),
    locationsById,
    energyDocumentsByLocationId,
    connectionDeclarationsByLocationId,
    chargerOrderByLocationId,
    chargersById,
    chargerDocumentsByChargerId,
    parserObservations: { byDocumentId: {} },
    customerConfirmations: {},
    manualCorrections: {},
    rejectedFactKeys: {},
    acceptances: legacy.consents,
  };
}

export function createFreshDocumentFirstSignupDraft(
  accountType: AccountType,
): DocumentFirstSignupDraft {
  return createDocumentFirstSignupDraftFromLegacy(
    createFreshSignupDraft(accountType),
  );
}

function correctionValue(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): DocumentFirstFactValue | undefined {
  return draft.manualCorrections[factKey]?.value ||
    draft.customerConfirmations[factKey]?.value;
}

function stringFact(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): string {
  const value = correctionValue(draft, factKey);
  return typeof value === "string" ? value : "";
}

function addressFact(
  draft: DocumentFirstSignupDraft,
  factKey: string,
  fallback: AddressDraft,
): AddressDraft {
  const value = correctionValue(draft, factKey);
  return value && typeof value !== "string" ? value : fallback;
}

export function documentFirstSignupToLegacyDraft(
  draft: DocumentFirstSignupDraft,
): SignupDraft {
  const accountType = draft.accountBasis.accountType;
  const personalInfo = {
    accountType,
    firstName: draft.legalParty.firstName ||
      stringFact(draft, "party:firstName"),
    lastName: draft.legalParty.lastName ||
      stringFact(draft, "party:lastName"),
    companyName: accountType === "zakelijk" ? draft.legalParty.legalName : "",
    organizationName: accountType === "vve" ? draft.legalParty.legalName : "",
    kvkNumber: draft.legalParty.kvkNumber,
    email: draft.accountBasis.email,
    phone: "",
    address: createAddressDraft(),
    kvkDocument: null,
  };

  const locations: SignupLocationDraft[] = draft.locationOrder.map(
    (locationId) => {
      const location = draft.locationsById[locationId];
      const address = addressFact(
        draft,
        locationFactKey(locationId, "address"),
        location.address,
      );
      const chargers = (draft.chargerOrderByLocationId[locationId] || []).map(
        (chargerId) => {
          const charger = draft.chargersById[chargerId];
          const brand = stringFact(draft, chargerFactKey(chargerId, "brand"));
          const model = stringFact(draft, chargerFactKey(chargerId, "model"));
          return {
            ...charger,
            source: brand || model ? "import" as const : "manual" as const,
            brand: brand || charger.brand,
            model: model || charger.model,
            midNumber: stringFact(
              draft,
              chargerFactKey(chargerId, "midNumber"),
            ) || charger.midNumber,
            serialNumber: stringFact(
              draft,
              chargerFactKey(chargerId, "serialNumber"),
            ) || charger.serialNumber,
            installationYear: "",
            backendSupplier: "",
            manualBackendSupplier: "",
            solarPanelStatus: "" as const,
          };
        },
      );

      const energyDocument = draft.energyDocumentsByLocationId[locationId];
      const energyCache = draft.parserObservations.byDocumentId[
        energyDocument.clientId
      ];
      return {
        clientId: locationId,
        address,
        energyDocument,
        energyDocumentObservation: energyCache
          ? projectEnergyDocumentObservation(energyCache.envelope)
          : null,
        connectionDeclaration:
          draft.connectionDeclarationsByLocationId[locationId],
        chargers,
      };
    },
  );

  const documentsByChargerId: DocumentsByChargerId = Object.fromEntries(
    Object.entries(draft.chargerDocumentsByChargerId).map(
      ([chargerId, documents]) => [
        chargerId,
        documents.map((document) => {
          const cache =
            draft.parserObservations.byDocumentId[document.clientId];
          return {
            ...document,
            observation: cache
              ? projectChargerDocumentObservation(cache.envelope)
              : null,
          };
        }),
      ],
    ),
  );

  return {
    personalInfo,
    locations,
    documentsByChargerId,
    consents: draft.acceptances,
  };
}

function clearFactScope(
  values: Record<string, unknown>,
  prefix: string,
): Record<string, never> | Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !key.startsWith(prefix)),
  );
}

function clearFactSuffix(
  values: Record<string, unknown>,
  suffix: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !key.endsWith(suffix)),
  );
}

function clearExactFact(
  values: Record<string, unknown>,
  factKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== factKey),
  );
}

function invalidateCorrectionsForDocument(
  corrections: Record<string, DocumentFirstManualCorrection>,
  documentId: string,
): Record<string, DocumentFirstManualCorrection> {
  return Object.fromEntries(
    Object.entries(corrections).filter(([, correction]) =>
      correction.sourceDocumentId !== documentId
    ),
  );
}

function withoutDocumentObservations(
  observations: Record<string, CachedDocumentObservation>,
  documentIds: ReadonlyArray<string>,
): Record<string, CachedDocumentObservation> {
  const next = { ...observations };
  documentIds.forEach((documentId) => delete next[documentId]);
  return next;
}

export function documentFirstSignupReducer(
  state: DocumentFirstSignupDraft,
  action: DocumentFirstSignupAction,
): DocumentFirstSignupDraft {
  switch (action.type) {
    case "replace_draft":
      return action.value;
    case "invalidate_quarantine_receipts":
      return {
        ...state,
        organizationDocument: {
          ...state.organizationDocument,
          quarantineStatus: "idle",
          quarantineFileReference: null,
          quarantineRevision: null,
        },
        energyDocumentsByLocationId: Object.fromEntries(
          Object.entries(state.energyDocumentsByLocationId).map(([id, document]) => [
            id,
            {
              ...document,
              quarantineStatus: "idle",
              quarantineFileReference: null,
              quarantineRevision: null,
            },
          ]),
        ),
        chargerDocumentsByChargerId: Object.fromEntries(
          Object.entries(state.chargerDocumentsByChargerId).map(([id, documents]) => [
            id,
            documents.map((document) => ({
              ...document,
              quarantineStatus: "idle",
              quarantineFileReference: null,
              quarantineRevision: null,
            })),
          ]),
        ),
      };
    case "update_account_basis":
      return { ...state, accountBasis: action.value };
    case "update_legal_party": {
      const partyChanged =
        state.legalParty.firstName !== action.value.firstName ||
        state.legalParty.lastName !== action.value.lastName ||
        state.legalParty.legalName !== action.value.legalName ||
        state.legalParty.kvkNumber !== action.value.kvkNumber;
      if (!partyChanged) return { ...state, legalParty: action.value };
      return {
        ...state,
        legalParty: action.value,
        customerConfirmations: clearFactSuffix(
          state.customerConfirmations,
          ":energy:contractHolder",
        ) as Record<string, DocumentFirstConfirmation>,
        manualCorrections: clearFactSuffix(
          state.manualCorrections,
          ":energy:contractHolder",
        ) as Record<string, DocumentFirstManualCorrection>,
        rejectedFactKeys: clearFactSuffix(
          state.rejectedFactKeys,
          ":energy:contractHolder",
        ) as Record<string, true>,
      };
    }
    case "update_organization_document": {
      const documentId = action.document.clientId;
      const fileChanged = state.organizationDocument.file !== action.document.file;
      return {
        ...state,
        organizationDocument: action.document,
        parserObservations: {
          byDocumentId: fileChanged
            ? withoutDocumentObservations(
              state.parserObservations.byDocumentId,
              [documentId],
            )
            : state.parserObservations.byDocumentId,
        },
        customerConfirmations: fileChanged
          ? invalidateDocumentConfirmations(state.customerConfirmations, documentId)
          : state.customerConfirmations,
        manualCorrections: fileChanged
          ? invalidateCorrectionsForDocument(state.manualCorrections, documentId)
          : state.manualCorrections,
        rejectedFactKeys: state.rejectedFactKeys,
      };
    }
    case "add_location": {
      const location = createLocationDraft();
      const charger = cleanChargerForDocumentFirst(
        location.chargers[0],
        location.clientId,
      );
      return {
        ...state,
        locationOrder: [...state.locationOrder, location.clientId],
        locationsById: {
          ...state.locationsById,
          [location.clientId]: {
            clientId: location.clientId,
            address: location.address,
          },
        },
        energyDocumentsByLocationId: {
          ...state.energyDocumentsByLocationId,
          [location.clientId]: location.energyDocument,
        },
        connectionDeclarationsByLocationId: {
          ...state.connectionDeclarationsByLocationId,
          [location.clientId]: createConnectionDeclarationDraft(),
        },
        chargerOrderByLocationId: {
          ...state.chargerOrderByLocationId,
          [location.clientId]: [charger.clientId],
        },
        chargersById: { ...state.chargersById, [charger.clientId]: charger },
        chargerDocumentsByChargerId: {
          ...state.chargerDocumentsByChargerId,
          [charger.clientId]: createDocumentDraftsForCharger(charger.clientId),
        },
      };
    }
    case "remove_location": {
      if (state.locationOrder.length <= 1) return state;
      const chargerIds = state.chargerOrderByLocationId[action.locationId] ||
        [];
      const nextLocations = { ...state.locationsById };
      const nextEnergyDocuments = { ...state.energyDocumentsByLocationId };
      const nextConnections = { ...state.connectionDeclarationsByLocationId };
      const nextChargerOrder = { ...state.chargerOrderByLocationId };
      const nextChargers = { ...state.chargersById };
      const nextChargerDocuments = { ...state.chargerDocumentsByChargerId };
      const removedDocumentIds = [
        state.energyDocumentsByLocationId[action.locationId]?.clientId,
        ...chargerIds.flatMap((chargerId) =>
          (state.chargerDocumentsByChargerId[chargerId] || []).map((document) =>
            document.clientId
          )
        ),
      ].filter((documentId): documentId is string => Boolean(documentId));
      delete nextLocations[action.locationId];
      delete nextEnergyDocuments[action.locationId];
      delete nextConnections[action.locationId];
      delete nextChargerOrder[action.locationId];
      chargerIds.forEach((chargerId) => {
        delete nextChargers[chargerId];
        delete nextChargerDocuments[chargerId];
      });
      let customerConfirmations = clearFactScope(
        state.customerConfirmations,
        `location:${action.locationId}:`,
      ) as Record<string, DocumentFirstConfirmation>;
      let manualCorrections = clearFactScope(
        state.manualCorrections,
        `location:${action.locationId}:`,
      ) as Record<string, DocumentFirstManualCorrection>;
      let rejectedFactKeys = clearFactScope(
        state.rejectedFactKeys,
        `location:${action.locationId}:`,
      ) as Record<string, true>;
      chargerIds.forEach((chargerId) => {
        customerConfirmations = clearFactScope(
          customerConfirmations,
          `charger:${chargerId}:`,
        ) as Record<string, DocumentFirstConfirmation>;
        manualCorrections = clearFactScope(
          manualCorrections,
          `charger:${chargerId}:`,
        ) as Record<string, DocumentFirstManualCorrection>;
        rejectedFactKeys = clearFactScope(
          rejectedFactKeys,
          `charger:${chargerId}:`,
        ) as Record<string, true>;
      });
      return {
        ...state,
        locationOrder: state.locationOrder.filter((id) =>
          id !== action.locationId
        ),
        locationsById: nextLocations,
        energyDocumentsByLocationId: nextEnergyDocuments,
        connectionDeclarationsByLocationId: nextConnections,
        chargerOrderByLocationId: nextChargerOrder,
        chargersById: nextChargers,
        chargerDocumentsByChargerId: nextChargerDocuments,
        parserObservations: {
          byDocumentId: withoutDocumentObservations(
            state.parserObservations.byDocumentId,
            removedDocumentIds,
          ),
        },
        customerConfirmations,
        manualCorrections,
        rejectedFactKeys,
      };
    }
    case "add_charger": {
      const charger = cleanChargerForDocumentFirst(
        createChargerDraft(),
        action.locationId,
      );
      return {
        ...state,
        chargerOrderByLocationId: {
          ...state.chargerOrderByLocationId,
          [action.locationId]: [
            ...(state.chargerOrderByLocationId[action.locationId] || []),
            charger.clientId,
          ],
        },
        chargersById: { ...state.chargersById, [charger.clientId]: charger },
        chargerDocumentsByChargerId: {
          ...state.chargerDocumentsByChargerId,
          [charger.clientId]: createDocumentDraftsForCharger(charger.clientId),
        },
      };
    }
    case "remove_charger": {
      const order = state.chargerOrderByLocationId[action.locationId] || [];
      if (order.length <= 1) return state;
      const nextChargers = { ...state.chargersById };
      const nextDocuments = { ...state.chargerDocumentsByChargerId };
      const removedDocumentIds = (
        state.chargerDocumentsByChargerId[action.chargerId] || []
      ).map((document) => document.clientId);
      delete nextChargers[action.chargerId];
      delete nextDocuments[action.chargerId];
      return {
        ...state,
        chargerOrderByLocationId: {
          ...state.chargerOrderByLocationId,
          [action.locationId]: order.filter((id) => id !== action.chargerId),
        },
        chargersById: nextChargers,
        chargerDocumentsByChargerId: nextDocuments,
        parserObservations: {
          byDocumentId: withoutDocumentObservations(
            state.parserObservations.byDocumentId,
            removedDocumentIds,
          ),
        },
        customerConfirmations: clearFactScope(
          state.customerConfirmations,
          `charger:${action.chargerId}:`,
        ) as Record<string, DocumentFirstConfirmation>,
        manualCorrections: clearFactScope(
          state.manualCorrections,
          `charger:${action.chargerId}:`,
        ) as Record<string, DocumentFirstManualCorrection>,
        rejectedFactKeys: clearFactScope(
          state.rejectedFactKeys,
          `charger:${action.chargerId}:`,
        ) as Record<string, true>,
      };
    }
    case "update_charger": {
      const prefix = `charger:${action.charger.clientId}:`;
      return {
        ...state,
        chargersById: {
          ...state.chargersById,
          [action.charger.clientId]: action.charger,
        },
        customerConfirmations: clearFactScope(
          state.customerConfirmations,
          prefix,
        ) as Record<string, DocumentFirstConfirmation>,
        manualCorrections: clearFactScope(
          state.manualCorrections,
          prefix,
        ) as Record<string, DocumentFirstManualCorrection>,
        rejectedFactKeys: clearFactScope(
          state.rejectedFactKeys,
          prefix,
        ) as Record<string, true>,
      };
    }
    case "update_energy_document": {
      const documentId = action.document.clientId;
      const current = state.energyDocumentsByLocationId[action.document.locationClientId];
      const fileChanged = current?.file !== action.document.file;
      const customerConfirmations = fileChanged
        ? invalidateDocumentConfirmations(state.customerConfirmations, documentId)
        : state.customerConfirmations;
      const manualCorrections = fileChanged
        ? invalidateCorrectionsForDocument(state.manualCorrections, documentId)
        : state.manualCorrections;
      return {
        ...state,
        energyDocumentsByLocationId: {
          ...state.energyDocumentsByLocationId,
          [action.document.locationClientId]: action.document,
        },
        parserObservations: {
          byDocumentId: fileChanged
            ? withoutDocumentObservations(state.parserObservations.byDocumentId, [documentId])
            : state.parserObservations.byDocumentId,
        },
        customerConfirmations,
        manualCorrections,
        rejectedFactKeys: state.rejectedFactKeys,
      };
    }
    case "update_connection_declaration": {
      const factKey = locationFactKey(action.locationId, "energy:ean");
      return {
        ...state,
        connectionDeclarationsByLocationId: {
          ...state.connectionDeclarationsByLocationId,
          [action.locationId]: action.value,
        },
        customerConfirmations: clearExactFact(
          state.customerConfirmations,
          factKey,
        ) as Record<string, DocumentFirstConfirmation>,
        manualCorrections: clearExactFact(
          state.manualCorrections,
          factKey,
        ) as Record<string, DocumentFirstManualCorrection>,
        rejectedFactKeys: clearExactFact(
          state.rejectedFactKeys,
          factKey,
        ) as Record<string, true>,
      };
    }
    case "set_document_observation": {
      const byDocumentId = { ...state.parserObservations.byDocumentId };
      if (action.value) byDocumentId[action.documentId] = action.value;
      else delete byDocumentId[action.documentId];
      return { ...state, parserObservations: { byDocumentId } };
    }
    case "update_charger_document": {
      const documentId = action.document.clientId;
      const current = (state.chargerDocumentsByChargerId[action.document.chargerClientId] || [])
        .find((document) => document.clientId === documentId);
      const fileChanged = current?.file !== action.document.file;
      return {
        ...state,
        chargerDocumentsByChargerId: {
          ...state.chargerDocumentsByChargerId,
          [action.document.chargerClientId]: (state
            .chargerDocumentsByChargerId[action.document.chargerClientId] || [])
            .map((document) =>
              document.clientId === action.document.clientId
                ? stripChargerObservation(action.document)
                : document
            ),
        },
        parserObservations: {
          byDocumentId: fileChanged
            ? withoutDocumentObservations(state.parserObservations.byDocumentId, [documentId])
            : state.parserObservations.byDocumentId,
        },
        customerConfirmations: fileChanged
          ? invalidateDocumentConfirmations(state.customerConfirmations, documentId)
          : state.customerConfirmations,
        manualCorrections: fileChanged
          ? invalidateCorrectionsForDocument(state.manualCorrections, documentId)
          : state.manualCorrections,
        rejectedFactKeys: state.rejectedFactKeys,
      };
    }
    case "confirm_fact": {
      const rejectedFactKeys = { ...state.rejectedFactKeys };
      delete rejectedFactKeys[action.factKey];
      return {
        ...state,
        customerConfirmations: {
          ...state.customerConfirmations,
          [action.factKey]: {
            factKey: action.canonicalFactKey,
            scopeKey: action.factKey,
            canonicalValue: action.value,
            value: action.value,
            source: state.manualCorrections[action.factKey]
              ? "manual"
              : "observed",
            sourceDocuments: action.sourceDocuments,
            confirmationStatus: "confirmed",
            confirmedAt: action.confirmedAt,
            correctedManually: Boolean(state.manualCorrections[action.factKey]),
            decisionStatus: action.decisionStatus,
            normalizationApplied: action.normalizationApplied,
            pendingPersistence: action.pendingPersistence,
          },
        },
        rejectedFactKeys,
      };
    }
    case "reject_fact": {
      const confirmations = { ...state.customerConfirmations };
      delete confirmations[action.factKey];
      return {
        ...state,
        customerConfirmations: confirmations,
        rejectedFactKeys: {
          ...state.rejectedFactKeys,
          [action.factKey]: true,
        },
      };
    }
    case "set_manual_correction": {
      const confirmations = { ...state.customerConfirmations };
      const rejectedFactKeys = { ...state.rejectedFactKeys };
      delete confirmations[action.factKey];
      delete rejectedFactKeys[action.factKey];
      return {
        ...state,
        customerConfirmations: confirmations,
        manualCorrections: {
          ...state.manualCorrections,
          [action.factKey]: {
            factKey: action.canonicalFactKey,
            scopeKey: action.factKey,
            canonicalValue: action.value,
            value: action.value,
            sourceDocumentId: action.sourceDocumentId,
            sourceDocumentType: action.sourceDocumentType,
            observedFact: action.observedFact,
            correctionType: action.correctionType,
            confirmedAt: action.confirmedAt,
            correctedManually: true,
            pendingPersistence: action.pendingPersistence,
          },
        },
        rejectedFactKeys,
      };
    }
    case "clear_manual_correction": {
      const manualCorrections = { ...state.manualCorrections };
      delete manualCorrections[action.factKey];
      return { ...state, manualCorrections };
    }
    case "update_acceptances":
      return { ...state, acceptances: action.value };
  }
}
