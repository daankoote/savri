import type {
  EnergyEanCandidate,
  EnergyEanExtractionPage,
} from "./energyEanCandidateExtractor";

export type ObservationConfidence =
  | "high"
  | "medium"
  | "low"
  | "unavailable";

export type ObservationExtractionMethod =
  | "semantic_contract_holder_block"
  | "semantic_delivery_address_block"
  | "semantic_supplier_block"
  | "document_header"
  | "labeled_document_date"
  | "ean_context"
  | "network_operator_context"
  | "invoice_labeled_field"
  | "invoice_address_block"
  | "explicit_installation_date"
  | "explicit_invoice_date"
  | "not_found";

type ObservationCandidateMetadata = {
  sourcePage: number | null;
  confidence: ObservationConfidence;
  extractionMethod: ObservationExtractionMethod;
  displayable: boolean;
  rejectionReason: string | null;
};

export type ObservedValue = ObservationCandidateMetadata & {
  value: string | null;
};

export type ObservedDeliveryAddress = ObservationCandidateMetadata & {
  value: string | null;
  street: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
};

export type ObservedEnergyConnection = ObservationCandidateMetadata & {
  normalizedEan: string;
  validFrom: string | null;
  validTo: string | null;
  openEnded: boolean;
};

export type EnergyDocumentObservation = {
  supplierName: ObservedValue;
  contractHolderName: ObservedValue;
  deliveryAddress: ObservedDeliveryAddress;
  electricityConnections: ObservedEnergyConnection[];
  gasConnections: ObservedEnergyConnection[];
  documentDate: ObservedValue;
  electricityNetworkOperatorCandidate: ObservedValue;
  limitations: string[];
};

type SemanticFieldCandidate = {
  value: string;
  sourcePage: number;
  confidence: Exclude<ObservationConfidence, "unavailable">;
  extractionMethod: ObservationExtractionMethod;
};

type ParsedDeliveryAddress = {
  value: string;
  street: string;
  houseNumber: string;
  houseNumberAddition: string | null;
  postalCode: string;
  city: string;
  country: string | null;
};

const CUSTOMER_BLOCK_LABEL =
  /\b(?:klantgegevens|uw\s+gegevens|gegevens\s+contracthouder|contracthoudergegevens)\b/i;
const SUPPLIER_BLOCK_LABEL =
  /\b(?:onze\s+gegevens|leveranciergegevens|gegevens\s+leverancier)\b/i;
const STRONG_HOLDER_LABEL =
  /^(?:naam\s+)?contracthouder|^contractant(?:naam)?$/i;
const DELIVERY_BLOCK_LABEL =
  /^(?:leveradres|aansluitadres|adres\s+aansluiting|adres\s+leveringslocatie|leveringsadres)\b/i;
const SUPPLIER_FIELD_LABEL =
  /^(?:energieleverancier|leverancier|contractpartij)\b/i;
const GENERIC_NAME_LABEL = /^naam\s*[:\-–—]?\s*$/i;
const FIELD_OR_BLOCK_LABEL =
  /^(?:naam|adres|postadres|postcode|plaats|land|contracthouder|leveradres|aansluitadres|leveringsadres|leverancier|energieleverancier|contractpartij|contractproduct|product|ean|datum|ingangsdatum|einddatum|onze\s+gegevens|uw\s+gegevens|klantgegevens)\b/i;
const UNICODE_DATE_SEPARATOR = "[-/.‐‑‒–—−]";

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedSearchValue(value: string): string {
  return clean(value).toLocaleLowerCase("nl-NL").replace(/[^a-z0-9]/g, "");
}

function missingValue(
  rejectionReason: string,
  extractionMethod: ObservationExtractionMethod = "not_found",
  sourcePage: number | null = null,
): ObservedValue {
  return {
    value: null,
    sourcePage,
    confidence: "unavailable",
    extractionMethod,
    displayable: false,
    rejectionReason,
  };
}

function observedValue(candidate: SemanticFieldCandidate): ObservedValue {
  return {
    value: candidate.value,
    sourcePage: candidate.sourcePage,
    confidence: candidate.confidence,
    extractionMethod: candidate.extractionMethod,
    displayable: true,
    rejectionReason: null,
  };
}

function missingDeliveryAddress(
  rejectionReason: string,
  sourcePage: number | null = null,
): ObservedDeliveryAddress {
  return {
    value: null,
    street: null,
    houseNumber: null,
    houseNumberAddition: null,
    postalCode: null,
    city: null,
    country: null,
    sourcePage,
    confidence: "unavailable",
    extractionMethod: sourcePage == null
      ? "not_found"
      : "semantic_delivery_address_block",
    displayable: false,
    rejectionReason,
  };
}

function pageLines(page: EnergyEanExtractionPage): string[] {
  return page.text.split(/\n/).map(clean).filter(Boolean);
}

function pageRows(page: EnergyEanExtractionPage): string[][] {
  return page.text.split(/\n/)
    .map((row) => row.split(/\t+/).map(clean).filter(Boolean))
    .filter((row) => row.length > 0);
}

function valueAfterLabel(value: string, label: RegExp): string {
  const match = clean(value).match(label);
  if (!match) return "";
  return clean(value.slice((match.index || 0) + match[0].length)).replace(
    /^\s*[:\-–—]\s*/,
    "",
  );
}

function adjacentCellValue(row: string[], labelIndex: number): string {
  const value = clean(row[labelIndex + 1]);
  return value && !FIELD_OR_BLOCK_LABEL.test(value) ? value : "";
}

function uniqueCandidates(
  candidates: SemanticFieldCandidate[],
): SemanticFieldCandidate[] {
  const unique = new Map<string, SemanticFieldCandidate>();
  for (const candidate of candidates) {
    const key = normalizedSearchValue(candidate.value);
    if (key && !unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function twoPartyNameCandidates(
  page: EnergyEanExtractionPage,
): {
  holder: SemanticFieldCandidate | null;
  supplier: SemanticFieldCandidate | null;
} {
  const rows = pageRows(page);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const nameLabelIndexes = row
      .map((cell, index) => GENERIC_NAME_LABEL.test(cell) ? index : -1)
      .filter((index) => index >= 0);
    if (nameLabelIndexes.length < 2) continue;

    const boundedRows = rows.slice(rowIndex + 1, rowIndex + 5);
    const hasTwoPostAddressColumns = boundedRows.some((candidateRow) =>
      candidateRow.filter((cell) => /^postadres\b/i.test(cell)).length >= 2
    );
    const hasTwoPostcodeColumns = boundedRows.some((candidateRow) =>
      candidateRow.filter((cell) => /^postcode\b/i.test(cell)).length >= 2
    );
    if (!hasTwoPostAddressColumns || !hasTwoPostcodeColumns) continue;

    const holderValue = adjacentCellValue(row, nameLabelIndexes[0]);
    const supplierValue = adjacentCellValue(
      row,
      nameLabelIndexes[nameLabelIndexes.length - 1],
    );
    return {
      holder: holderValue
        ? {
          value: holderValue,
          sourcePage: page.page,
          confidence: "medium",
          extractionMethod: "semantic_contract_holder_block",
        }
        : null,
      supplier: supplierValue
        ? {
          value: supplierValue,
          sourcePage: page.page,
          confidence: "medium",
          extractionMethod: "semantic_supplier_block",
        }
        : null,
    };
  }
  return { holder: null, supplier: null };
}

function privacySafeText(value: string): boolean {
  const text = clean(value);
  if (!text || text.length > 120) return false;
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i.test(text)) return false;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text)) return false;
  if (/\b(?:\+31|0031|0)\s*\d(?:[\s().-]*\d){8}\b/.test(text)) {
    return false;
  }
  if (
    /\b(?:klantnummer|rekening|iban|termijnbedrag|betaalwijze|tarief)\b/i.test(
      text,
    )
  ) return false;
  return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(text);
}

function holderRejectionReason(value: string): string | null {
  const candidate = clean(value);
  if (!candidate) return "holder_candidate_empty";
  if (candidate.length > 80) return "holder_candidate_too_long";
  if ((candidate.match(/\bnaam\b/gi) || []).length > 0) {
    return "holder_candidate_contains_field_label";
  }
  if (
    /\b(?:postadres|postcode|ean|leverancier|energieleverancier|contractproduct|ingangsdatum|einddatum)\b/i
      .test(candidate)
  ) return "holder_candidate_contains_field_label";
  if (/\benergie\s+(?:b\.?\s*v\.?|n\.?\s*v\.?|bedrijf)\b/i.test(candidate)) {
    return "holder_candidate_contains_supplier_fragment";
  }
  if (/\d|@|\t/.test(candidate)) return "holder_candidate_not_name_like";

  const words = candidate.split(/\s+/).filter(Boolean);
  const organization =
    /\b(?:b\.?\s*v\.?|n\.?\s*v\.?|holding|stichting|vereniging|vve|co[oö]peratie|maatschap|vof)\b/i
      .test(candidate);
  const naturalName = words.length >= 1 && words.length <= 7 &&
    words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ.'’-]+$/.test(word));
  return naturalName || organization ? null : "holder_candidate_not_name_like";
}

function supplierRejectionReason(value: string): string | null {
  const candidate = clean(value).replace(/^naam\s*[:\-–—]?\s*/i, "");
  if (!candidate) return "supplier_candidate_empty";
  if (candidate.length > 100) return "supplier_candidate_too_long";
  if (
    /^(?:naam|leverancier|energieleverancier|onze\s+gegevens|contact)$/i.test(
      candidate,
    )
  ) return "supplier_candidate_is_label";
  if (!privacySafeText(candidate)) return "supplier_candidate_not_safe";
  if (
    /\b(?:postadres|postcode|straat|laan|weg|plein|telefoon|e-?mail|iban|ean)\b/i
      .test(candidate)
  ) return "supplier_candidate_contains_non_name_field";
  if ((candidate.match(/\bnaam\b/gi) || []).length > 0) {
    return "supplier_candidate_contains_field_label";
  }
  return normalizedSearchValue(candidate).length >= 3
    ? null
    : "supplier_candidate_too_short";
}

function chooseValidatedValue(
  rawCandidates: SemanticFieldCandidate[],
  validator: (value: string) => string | null,
  missingReason: string,
  ambiguousReason: string,
): ObservedValue {
  let firstRejection:
    | { reason: string; candidate: SemanticFieldCandidate }
    | null = null;
  const accepted: SemanticFieldCandidate[] = [];
  for (const candidate of rawCandidates) {
    const reason = validator(candidate.value);
    if (reason) {
      firstRejection ||= { reason, candidate };
    } else {
      accepted.push(candidate);
    }
  }

  const unique = uniqueCandidates(accepted);
  if (unique.length === 1) return observedValue(unique[0]);
  if (unique.length > 1) {
    return missingValue(
      ambiguousReason,
      unique[0].extractionMethod,
      unique[0].sourcePage,
    );
  }
  if (firstRejection) {
    return missingValue(
      firstRejection.reason,
      firstRejection.candidate.extractionMethod,
      firstRejection.candidate.sourcePage,
    );
  }
  return missingValue(missingReason);
}

function extractContractHolder(
  pages: EnergyEanExtractionPage[],
): ObservedValue {
  const strongCandidates: SemanticFieldCandidate[] = [];
  const boundedGenericCandidates: SemanticFieldCandidate[] = [];
  const twoPartyCandidates = pages
    .map(twoPartyNameCandidates)
    .flatMap((candidate) => candidate.holder ? [candidate.holder] : []);

  for (const page of pages) {
    const rows = pageRows(page);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const cell = row[cellIndex];
        const strongMatch = cell.match(STRONG_HOLDER_LABEL);
        if (!strongMatch) continue;
        const inline = valueAfterLabel(cell, STRONG_HOLDER_LABEL);
        const value = inline || adjacentCellValue(row, cellIndex);
        if (value) {
          strongCandidates.push({
            value,
            sourcePage: page.page,
            confidence: "high",
            extractionMethod: "semantic_contract_holder_block",
          });
        }
      }

      const heading = row.join(" ");
      if (!CUSTOMER_BLOCK_LABEL.test(heading)) continue;
      for (
        let offset = 1;
        offset <= 6 && rowIndex + offset < rows.length;
        offset += 1
      ) {
        const candidateRow = rows[rowIndex + offset];
        const nameLabelIndex = candidateRow.findIndex((cell) =>
          GENERIC_NAME_LABEL.test(cell)
        );
        if (nameLabelIndex < 0) continue;
        const value = adjacentCellValue(candidateRow, nameLabelIndex);
        if (value) {
          boundedGenericCandidates.push({
            value,
            sourcePage: page.page,
            confidence: "medium",
            extractionMethod: "semantic_contract_holder_block",
          });
        }
        break;
      }
    }
  }

  return chooseValidatedValue(
    strongCandidates.length > 0
      ? strongCandidates
      : boundedGenericCandidates.length > 0
      ? boundedGenericCandidates
      : twoPartyCandidates,
    holderRejectionReason,
    "contract_holder_block_not_found",
    "multiple_contract_holder_candidates",
  );
}

function supplierHeaderCandidates(
  page: EnergyEanExtractionPage,
): SemanticFieldCandidate[] {
  const candidates: SemanticFieldCandidate[] = [];
  for (const line of pageLines(page).slice(0, 12)) {
    if (FIELD_OR_BLOCK_LABEL.test(line)) continue;
    if (
      !/\b(?:b\.?\s*v\.?|n\.?\s*v\.?|energie|energy|stichting|co[oö]peratie)\b/i
        .test(line)
    ) continue;
    candidates.push({
      value: line,
      sourcePage: page.page,
      confidence: "medium",
      extractionMethod: "document_header",
    });
  }
  return candidates;
}

function extractSupplierName(pages: EnergyEanExtractionPage[]): ObservedValue {
  const semanticCandidates: SemanticFieldCandidate[] = [];
  const twoPartyCandidates = pages
    .map(twoPartyNameCandidates)
    .flatMap((candidate) => candidate.supplier ? [candidate.supplier] : []);

  for (const page of pages) {
    const rows = pageRows(page);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const cell = row[cellIndex];
        const explicitMatch = cell.match(SUPPLIER_FIELD_LABEL);
        const supplierBlockMatch = cell.match(SUPPLIER_BLOCK_LABEL);
        if (explicitMatch || supplierBlockMatch) {
          const label = explicitMatch
            ? SUPPLIER_FIELD_LABEL
            : SUPPLIER_BLOCK_LABEL;
          const inline = valueAfterLabel(cell, label);
          const value = inline || adjacentCellValue(row, cellIndex);
          if (value) {
            semanticCandidates.push({
              value,
              sourcePage: page.page,
              confidence: "high",
              extractionMethod: "semantic_supplier_block",
            });
          }
        }
      }

      const heading = row.join(" ");
      if (!SUPPLIER_BLOCK_LABEL.test(heading)) continue;
      const combinedCustomerBlock = CUSTOMER_BLOCK_LABEL.test(heading);
      for (
        let offset = 1;
        offset <= 6 && rowIndex + offset < rows.length;
        offset += 1
      ) {
        const candidateRow = rows[rowIndex + offset];
        const nameLabelIndexes = candidateRow
          .map((cell, index) => GENERIC_NAME_LABEL.test(cell) ? index : -1)
          .filter((index) => index >= 0);
        if (nameLabelIndexes.length === 0) continue;
        const labelIndex = combinedCustomerBlock
          ? nameLabelIndexes[nameLabelIndexes.length - 1]
          : nameLabelIndexes[0];
        const value = adjacentCellValue(candidateRow, labelIndex);
        if (value) {
          semanticCandidates.push({
            value,
            sourcePage: page.page,
            confidence: "medium",
            extractionMethod: "semantic_supplier_block",
          });
        }
        break;
      }
    }
  }

  const semantic = chooseValidatedValue(
    twoPartyCandidates.length > 0 ? twoPartyCandidates : semanticCandidates,
    supplierRejectionReason,
    "supplier_block_not_found",
    "multiple_supplier_candidates",
  );
  if (
    semantic.displayable ||
    twoPartyCandidates.length > 0 ||
    semanticCandidates.length > 0
  ) return semantic;

  return chooseValidatedValue(
    pages.flatMap(supplierHeaderCandidates),
    supplierRejectionReason,
    "supplier_header_not_found",
    "multiple_supplier_header_candidates",
  );
}

function deliveryAddressPieces(
  rows: string[][],
  rowIndex: number,
  cellIndex: number,
  inlineValue: string,
): string[] {
  const pieces: string[] = [];
  if (inlineValue) pieces.push(inlineValue);
  const rowValues = rows[rowIndex].slice(cellIndex + 1).map(clean).filter(
    (value) => value && !FIELD_OR_BLOCK_LABEL.test(value),
  );
  const last = rowValues[rowValues.length - 1] || "";
  const beforeLast = rowValues[rowValues.length - 2] || "";
  if (
    rowValues.length >= 3 && /^\d{1,5}$/.test(beforeLast) &&
    /^[A-Za-z0-9]{1,6}$/.test(last)
  ) {
    pieces.push(
      `${rowValues.slice(0, -2).join(" ")} ${beforeLast}-${last}`,
    );
  } else if (
    rowValues.length >= 2 && /\s\d{1,5}$/.test(beforeLast) &&
    /^[A-Za-z0-9]{1,6}$/.test(last)
  ) {
    pieces.push(`${rowValues.slice(0, -1).join(" ")}-${last}`);
  } else if (rowValues.length > 0) {
    pieces.push(rowValues.join(" "));
  }

  const valueColumn = cellIndex + 1;
  for (let offset = 1; offset <= 4; offset += 1) {
    const row = rows[rowIndex + offset];
    if (!row) break;
    const rowText = row.join(" ");
    if (
      DELIVERY_BLOCK_LABEL.test(rowText) || SUPPLIER_BLOCK_LABEL.test(rowText)
    ) {
      break;
    }
    if (
      /^(?:ean|contractproduct|product|ingangsdatum|einddatum)\b/i.test(rowText)
    ) {
      break;
    }

    const preferred = clean(row[valueColumn]);
    const sameColumn = clean(row[cellIndex]);
    const singleCell = row.length === 1 ? clean(row[0]) : "";
    const value = preferred && !FIELD_OR_BLOCK_LABEL.test(preferred)
      ? preferred
      : singleCell && !DELIVERY_BLOCK_LABEL.test(singleCell)
      ? singleCell
      : sameColumn && !FIELD_OR_BLOCK_LABEL.test(sameColumn)
      ? sameColumn
      : "";
    if (value) pieces.push(value);
    const postalWithCity = pieces.some((piece) => {
      const match = piece.match(/\b\d{4}\s?[A-Za-z]{2}\b/);
      if (!match) return false;
      return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(
        piece.slice((match.index || 0) + match[0].length),
      );
    });
    if (/^plaats\b/i.test(row[0] || "") || postalWithCity) {
      break;
    }
  }
  return pieces;
}

function parseDeliveryAddressPieces(
  pieces: string[],
): { address: ParsedDeliveryAddress | null; rejectionReason: string | null } {
  const cleanedPieces = pieces.map((piece) =>
    clean(piece)
      .replace(/^(?:adres|straat)\s*[:\-–—]?\s*/i, "")
      .replace(/^(?:postcode(?:\s+en\s+plaats)?|plaats)\s*[:\-–—]?\s*/i, "")
  ).filter(Boolean);
  const raw = cleanedPieces.join(" ");
  if (!raw) return { address: null, rejectionReason: "delivery_address_empty" };
  if (
    /\b(?:postadres|correspondentieadres|factuuradres)\b/i.test(raw)
  ) {
    return {
      address: null,
      rejectionReason: "delivery_address_contains_non_delivery_label",
    };
  }
  if (FIELD_OR_BLOCK_LABEL.test(raw)) {
    return {
      address: null,
      rejectionReason: "delivery_address_contains_field_label",
    };
  }

  const postalMatches = [...raw.matchAll(/\b(\d{4})\s*([A-Za-z]{2})\b/g)];
  if (postalMatches.length !== 1) {
    return {
      address: null,
      rejectionReason: postalMatches.length > 1
        ? "delivery_address_contains_multiple_postcodes"
        : "delivery_address_postcode_missing",
    };
  }

  const streetPattern =
    /^([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9.'’\- ]*?[A-Za-zÀ-ÖØ-öø-ÿ])\s*(\d{1,5})(?:\s*[-/]?\s*([A-Za-z0-9]{1,6}))?$/;
  const streetMatches = cleanedPieces
    .map((piece) => piece.match(streetPattern))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  if (streetMatches.length !== 1) {
    return {
      address: null,
      rejectionReason: streetMatches.length > 1
        ? "delivery_address_contains_multiple_addresses"
        : "delivery_address_street_missing",
    };
  }

  const postalMatch = postalMatches[0];
  const streetMatch = streetMatches[0];
  const postalEnd = (postalMatch.index || 0) + postalMatch[0].length;
  const afterPostcode = clean(raw.slice(postalEnd)).replace(/^[,\s]+/, "");
  const countryMatch = afterPostcode.match(
    /\b(Nederland|Netherlands|The Netherlands)\b/i,
  );
  const city = clean(
    afterPostcode.slice(0, countryMatch?.index ?? afterPostcode.length)
      .replace(/[,;]+$/, ""),
  );
  if (!city || /\d/.test(city) || FIELD_OR_BLOCK_LABEL.test(city)) {
    return { address: null, rejectionReason: "delivery_address_city_missing" };
  }

  const street = clean(streetMatch[1]);
  const houseNumber = streetMatch[2];
  const houseNumberAddition = clean(streetMatch[3]) || null;
  const postalCode = postalMatch[1] + postalMatch[2].toUpperCase();
  const country = countryMatch ? "Nederland" : null;
  const value = [
    street + " " + houseNumber +
    (houseNumberAddition ? "-" + houseNumberAddition : ""),
    postalCode + " " + city,
    country,
  ].filter(Boolean).join(", ");
  return {
    address: {
      value,
      street,
      houseNumber,
      houseNumberAddition,
      postalCode,
      city,
      country,
    },
    rejectionReason: null,
  };
}

function corroboratedHouseNumberBoundary(
  pages: EnergyEanExtractionPage[],
  address: ParsedDeliveryAddress,
): { houseNumber: string; houseNumberAddition: string } | null {
  // A repeated address row may corroborate an explicit PDF cell boundary. It
  // never supplies a different street/address or heuristically splits digits.
  if (address.houseNumberAddition || !/^\d{2,5}$/.test(address.houseNumber)) {
    return null;
  }
  const matches = new Map<string, {
    houseNumber: string;
    houseNumberAddition: string;
  }>();

  for (const page of pages) {
    for (const row of pageRows(page)) {
      for (let index = 0; index < row.length; index += 1) {
        if (!/^(?:postadres|adres)$/i.test(clean(row[index]))) continue;
        const streetAndNumber = clean(row[index + 1]);
        const addition = clean(row[index + 2]);
        const match = streetAndNumber.match(/^(.+?\D)\s*(\d{1,5})$/);
        if (!match || !/^[A-Za-z0-9]{1,6}$/.test(addition)) continue;
        const street = clean(match[1]);
        const houseNumber = match[2];
        if (
          normalizedSearchValue(street) !==
            normalizedSearchValue(address.street) ||
          `${houseNumber}${addition}`.toLocaleUpperCase("nl-NL") !==
            address.houseNumber.toLocaleUpperCase("nl-NL")
        ) continue;
        matches.set(`${houseNumber}|${addition}`, {
          houseNumber,
          houseNumberAddition: addition,
        });
      }
    }
  }

  return matches.size === 1 ? [...matches.values()][0] : null;
}

function extractDeliveryAddress(
  pages: EnergyEanExtractionPage[],
): ObservedDeliveryAddress {
  const accepted: Array<{
    address: ParsedDeliveryAddress;
    sourcePage: number;
  }> = [];
  let firstRejection: { reason: string; sourcePage: number } | null = null;

  for (const page of pages) {
    const rows = pageRows(page);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const cell = row[cellIndex];
        if (!DELIVERY_BLOCK_LABEL.test(cell)) continue;
        const pieces = deliveryAddressPieces(
          rows,
          rowIndex,
          cellIndex,
          valueAfterLabel(cell, DELIVERY_BLOCK_LABEL),
        );
        const parsed = parseDeliveryAddressPieces(pieces);
        if (parsed.address) {
          accepted.push({ address: parsed.address, sourcePage: page.page });
        } else if (parsed.rejectionReason) {
          firstRejection ||= {
            reason: parsed.rejectionReason,
            sourcePage: page.page,
          };
        }
      }
    }
  }

  const unique = new Map<string, {
    address: ParsedDeliveryAddress;
    sourcePage: number;
  }>();
  for (const candidate of accepted) {
    unique.set(normalizedSearchValue(candidate.address.value), candidate);
  }
  if (unique.size > 1) {
    const sourcePage = [...unique.values()][0].sourcePage;
    return missingDeliveryAddress(
      "multiple_delivery_address_candidates",
      sourcePage,
    );
  }
  if (unique.size === 1) {
    const candidate = [...unique.values()][0];
    const boundary = corroboratedHouseNumberBoundary(
      pages,
      candidate.address,
    );
    const address = boundary
      ? {
        ...candidate.address,
        houseNumber: boundary.houseNumber,
        houseNumberAddition: boundary.houseNumberAddition,
        value: [
          `${candidate.address.street} ${boundary.houseNumber}-${boundary.houseNumberAddition}`,
          `${candidate.address.postalCode} ${candidate.address.city}`,
          candidate.address.country,
        ].filter(Boolean).join(", "),
      }
      : candidate.address;
    return {
      ...address,
      sourcePage: candidate.sourcePage,
      confidence: "high",
      extractionMethod: "semantic_delivery_address_block",
      displayable: true,
      rejectionReason: null,
    };
  }
  return firstRejection
    ? missingDeliveryAddress(firstRejection.reason, firstRejection.sourcePage)
    : missingDeliveryAddress("delivery_address_block_not_found");
}

function isoDate(value: string): string | null {
  const numericPattern = new RegExp(
    "(?<!\\d)(\\d{1,2})\\s*" + UNICODE_DATE_SEPARATOR +
      "\\s*(\\d{1,2})\\s*" + UNICODE_DATE_SEPARATOR +
      "\\s*(\\d{4})(?!\\d)",
  );
  const match = value.match(numericPattern);
  const monthNames = [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ];
  const written = value.match(
    /\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})\b/i,
  );
  if (!match && !written) return null;
  const day = Number(match?.[1] || written?.[1]);
  const month = match
    ? Number(match[2])
    : monthNames.indexOf(written![2].toLocaleLowerCase("nl-NL")) + 1;
  const year = Number(match?.[3] || written?.[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    day < 1 || month < 1 || month > 12 ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return null;
  return year + "-" + String(month).padStart(2, "0") + "-" +
    String(day).padStart(2, "0");
}

function datesFromContext(context: string): string[] {
  const numericPattern = new RegExp(
    "\\b\\d{1,2}\\s*" + UNICODE_DATE_SEPARATOR +
      "\\s*\\d{1,2}\\s*" + UNICODE_DATE_SEPARATOR +
      "\\s*\\d{4}(?!\\d)",
    "g",
  );
  return [
    ...new Set(
      [
        ...context.matchAll(numericPattern),
        ...context.matchAll(
          /\b\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}\b/gi,
        ),
      ].map((match) => isoDate(match[0]))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function connectionContext(
  pages: EnergyEanExtractionPage[],
  candidate: EnergyEanCandidate,
): string {
  const page = pages.find((item) => item.page === candidate.page);
  if (!page) return candidate.context;
  const lines = pageLines(page);
  const lineIndex = lines.findIndex((line) =>
    line.replace(/\D/g, "").includes(candidate.normalizedEan)
  );
  if (lineIndex < 0) return candidate.context;

  const nearby = lines.slice(
    Math.max(0, lineIndex - 4),
    Math.min(lines.length, lineIndex + 5),
  );
  const periodLines = nearby.filter((line) =>
    /\b(?:contractperiode|leveringsperiode|looptijd|ingangsdatum|einddatum|vanaf|tot|t\/m|onbepaalde tijd|onbekend)\b/i
      .test(line) || datesFromContext(line).length > 0
  );
  return [candidate.context, ...periodLines].join(" ");
}

function observedConnection(
  pages: EnergyEanExtractionPage[],
  candidate: EnergyEanCandidate,
): ObservedEnergyConnection {
  const context = connectionContext(pages, candidate);
  const dates = datesFromContext(context);
  const openEnded = /\b(?:onbepaalde tijd|onbekend|geen einddatum)\b/i.test(
    context,
  );
  return {
    normalizedEan: candidate.normalizedEan,
    validFrom: dates[0] || null,
    validTo: openEnded ? null : dates[1] || null,
    openEnded,
    sourcePage: candidate.page,
    confidence: candidate.classification === "unclassified" ? "medium" : "high",
    extractionMethod: "ean_context",
    displayable: true,
    rejectionReason: null,
  };
}

function extractDocumentDate(pages: EnergyEanExtractionPage[]): ObservedValue {
  for (const page of pages) {
    for (const line of pageLines(page)) {
      if (
        !/\b(?:documentdatum|factuurdatum|opgesteld op|datum document)\b/i.test(
          line,
        )
      ) continue;
      const value = isoDate(line);
      if (value) {
        return observedValue({
          value,
          sourcePage: page.page,
          confidence: "high",
          extractionMethod: "labeled_document_date",
        });
      }
    }
  }
  return missingValue("document_date_not_found");
}

function extractNetworkOperator(
  pages: EnergyEanExtractionPage[],
): { value: ObservedValue; ambiguous: boolean } {
  const mentionLines = pages.flatMap((page) =>
    pageLines(page)
      .filter((line) => /\bnet\s*beheerder\b/i.test(line))
      .map((line) => ({ line, page: page.page }))
  );
  if (mentionLines.length > 1) {
    return {
      value: missingValue(
        "multiple_network_operator_mentions",
        "network_operator_context",
      ),
      ambiguous: true,
    };
  }

  const candidates = new Map<string, { value: string; page: number }>();
  for (const page of pages) {
    const lines = pageLines(page);
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(
        /\bnet\s*beheerder\b\s*[:—-]?\s*(.*)$/i,
      );
      if (!match) continue;
      const inline = clean(match[1]);
      const value = inline || clean(lines[index + 1]);
      if (!privacySafeText(value)) continue;
      candidates.set(normalizedSearchValue(value), { value, page: page.page });
    }
  }

  if (candidates.size !== 1) {
    return {
      value: missingValue(
        candidates.size > 1
          ? "multiple_network_operator_candidates"
          : "network_operator_not_found",
        candidates.size > 0 ? "network_operator_context" : "not_found",
      ),
      ambiguous: candidates.size > 1,
    };
  }
  const candidate = [...candidates.values()][0];
  const linkedToElectricity = pages.some((page) =>
    page.page === candidate.page &&
    pageLines(page).some((line) =>
      /\belektriciteit\b/i.test(line) &&
      normalizedSearchValue(line).includes(
        normalizedSearchValue(candidate.value),
      )
    )
  );
  return linkedToElectricity
    ? {
      value: observedValue({
        value: candidate.value,
        sourcePage: candidate.page,
        confidence: "medium",
        extractionMethod: "network_operator_context",
      }),
      ambiguous: false,
    }
    : {
      value: missingValue(
        "network_operator_not_linked_to_electricity",
        "network_operator_context",
        candidate.page,
      ),
      ambiguous: true,
    };
}

export function extractEnergyDocumentObservation(
  pages: EnergyEanExtractionPage[],
  eanCandidates: EnergyEanCandidate[],
): EnergyDocumentObservation {
  const networkOperator = extractNetworkOperator(pages);
  const limitations: string[] = [];
  if (networkOperator.ambiguous) limitations.push("network_operator_ambiguous");

  return {
    supplierName: extractSupplierName(pages),
    contractHolderName: extractContractHolder(pages),
    deliveryAddress: extractDeliveryAddress(pages),
    electricityConnections: eanCandidates
      .filter((candidate) => candidate.classification === "electricity")
      .map((candidate) => observedConnection(pages, candidate)),
    gasConnections: eanCandidates
      .filter((candidate) => candidate.classification === "gas")
      .map((candidate) => observedConnection(pages, candidate)),
    documentDate: extractDocumentDate(pages),
    electricityNetworkOperatorCandidate: networkOperator.value,
    limitations,
  };
}
