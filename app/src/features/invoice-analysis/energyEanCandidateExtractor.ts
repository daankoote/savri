export type EnergyEanClassification =
  | "electricity"
  | "gas"
  | "unclassified";

export type EnergyEanCandidate = {
  normalizedEan: string;
  classification: EnergyEanClassification;
  context: string;
  page: number | null;
};

export type EnergyEanExtractionPage = {
  page: number;
  text: string;
};

const ELECTRICITY_SIGNAL =
  /\b(?:elektriciteit|elektriciteitsaansluiting|stroom)\b|\bEAN\s+elektriciteit\b/i;
const GAS_SIGNAL = /\b(?:gas|gasaansluiting)\b|\bEAN\s+gas\b/i;
const SEPARATOR = /[ ._\-/]/;
const EAN_PATTERN = /(?:\d[ ._\-/]*){17}\d/g;

function compactContext(line: string): string {
  const compact = line.replace(/\s+/g, " ").trim();
  if (compact.length <= 140) return compact;
  return `${compact.slice(0, 137)}...`;
}

function classifyContext(context: string): EnergyEanClassification {
  const electricity = ELECTRICITY_SIGNAL.test(context);
  const gas = GAS_SIGNAL.test(context);

  if (electricity === gas) return "unclassified";
  return electricity ? "electricity" : "gas";
}

function hasAdjacentDigit(line: string, start: number, end: number): boolean {
  let before = start - 1;
  while (before >= 0 && SEPARATOR.test(line[before])) before -= 1;
  if (before >= 0 && /\d/.test(line[before])) return true;

  let after = end;
  while (after < line.length && SEPARATOR.test(line[after])) after += 1;
  return after < line.length && /\d/.test(line[after]);
}

export function extractEnergyEanCandidates(
  extractedText: string | EnergyEanExtractionPage[],
): EnergyEanCandidate[] {
  const candidates = new Map<string, EnergyEanCandidate>();
  const pages = Array.isArray(extractedText)
    ? extractedText
    : [{ page: 0, text: String(extractedText || "") }];

  for (const page of pages) {
    const lines = page.text.replace(/\r/g, "\n").split("\n");
    for (const line of lines) {
      for (const match of line.matchAll(EAN_PATTERN)) {
        const source = match[0];
        const start = match.index ?? 0;
        const end = start + source.length;
        if (hasAdjacentDigit(line, start, end)) continue;

        const normalizedEan = source.replace(/\D/g, "");
        if (!/^\d{18}$/.test(normalizedEan)) continue;

        const context = compactContext(line);
        const classification = classifyContext(context);
        const existing = candidates.get(normalizedEan);

        if (!existing) {
          candidates.set(normalizedEan, {
            normalizedEan,
            classification,
            context,
            page: page.page > 0 ? page.page : null,
          });
          continue;
        }

        if (
          existing.classification !== classification &&
          classification !== "unclassified"
        ) {
          candidates.set(normalizedEan, {
            ...existing,
            classification: existing.classification === "unclassified"
              ? classification
              : "unclassified",
          });
        }
      }
    }
  }

  return [...candidates.values()];
}

export function getConfirmableEnergyEanCandidates(
  candidates: EnergyEanCandidate[],
): EnergyEanCandidate[] {
  const electricity = candidates.filter((candidate) =>
    candidate.classification === "electricity"
  );
  if (electricity.length > 0) return electricity;

  return candidates.filter((candidate) =>
    candidate.classification === "unclassified"
  );
}
