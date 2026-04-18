// /assets/js/analyse/analyse_invoice_contract.js
// NON-module. Hangt onder window.ENVAL.invoice_contract

(function () {
  window.ENVAL = window.ENVAL || {};

  const LOAD_BEARING_FIELDS = [
    "customer_name",
    "address_line",
    "postcode_line",
    "city_line",
    "serial_number",
    "mid_number",
  ];

  const ALL_FIELDS = [
    "customer_name",
    "address_line",
    "house_number",
    "postcode_line",
    "city_line",
    "country_line",
    "brand",
    "model",
    "serial_number",
    "serial_candidate_raw",
    "mid_number",
    "mid_candidate_raw",
  ];

  function cleanLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeCompact(value) {
    return cleanLine(String(value ?? "").toUpperCase()).replace(/[^A-Z0-9]/g, "");
  }

  function normalizeName(value) {
    return cleanLine(String(value ?? "").toLowerCase())
      .replace(/[^a-zà-ÿ\s\-']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeAddressLine(value) {
    return cleanLine(String(value ?? "").toLowerCase());
  }

  function normalizeCity(value) {
    return cleanLine(String(value ?? "").toLowerCase());
  }

  function normalizePostcode(value) {
    return normalizeCompact(value);
  }

  function normalizeSerial(value) {
    return normalizeCompact(value);
  }

  function normalizeMid(value) {
    return normalizeCompact(value);
  }

  function valuesEqual(fieldName, expected, observed) {
    if (expected == null || observed == null) return false;

    if (fieldName === "customer_name") {
      return normalizeName(expected) === normalizeName(observed);
    }
    if (fieldName === "address_line") {
      return normalizeAddressLine(expected) === normalizeAddressLine(observed);
    }
    if (fieldName === "postcode_line") {
      return normalizePostcode(expected) === normalizePostcode(observed);
    }
    if (fieldName === "city_line") {
      return normalizeCity(expected) === normalizeCity(observed);
    }
    if (fieldName === "serial_number") {
      return normalizeSerial(expected) === normalizeSerial(observed);
    }
    if (fieldName === "mid_number") {
      return normalizeMid(expected) === normalizeMid(observed);
    }
    if (fieldName === "brand" || fieldName === "model" || fieldName === "country_line") {
      return cleanLine(expected).toLowerCase() === cleanLine(observed).toLowerCase();
    }

    return cleanLine(expected) === cleanLine(observed);
  }

  function isNonEmpty(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function emptyObservedFields() {
    return {
      customer_name: null,
      address_line: null,
      house_number: null,
      postcode_line: null,
      city_line: null,
      country_line: null,
      brand: null,
      model: null,
      serial_number: null,
      serial_candidate_raw: null,
      mid_number: null,
      mid_candidate_raw: null,
    };
  }

  function normalizeObservedFields(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const out = emptyObservedFields();

    for (const fieldName of ALL_FIELDS) {
      const value = src[fieldName];
      out[fieldName] = isNonEmpty(value) ? cleanLine(value) : null;
    }

    return out;
  }

  function imageKeyFromResult(result) {
    const imagePath = String(result?.image_path || result?.imageKey || "");
    const markerImage = "/docs/facturen/facturen_image/";
    if (imagePath.includes(markerImage)) {
      return imagePath.split(markerImage)[1];
    }

    const markerGeneric = "/docs/facturen/";
    if (imagePath.includes(markerGeneric)) {
      return imagePath.split(markerGeneric)[1];
    }

    return imagePath || null;
  }

  function splitPageSuffix(imageKey) {
    const s = String(imageKey || "");
    const m = s.match(/^(.*)_p(\d{2})\.(jpg|jpeg|png)$/i);
    if (!m) {
      return { document_key: s, page_num: null };
    }
    return {
      document_key: `${m[1]}.${m[3]}`,
      page_num: Number(m[2]),
    };
  }

  function pageSortKey(entry) {
    const pageNum = Number(entry?.page_num);
    if (Number.isFinite(pageNum)) {
      return pageNum;
    }
    return 9999;
  }

  function fieldScore(fieldName, value, pageNum, limitations) {
    if (!isNonEmpty(value)) return -1;

    let score = 10;

    if (Number.isFinite(pageNum)) {
      score += Math.max(0, 10 - pageNum);
    }

    if (LOAD_BEARING_FIELDS.includes(fieldName)) {
      score += 10;
    }

    if (fieldName === "serial_number" || fieldName === "mid_number") {
      score += 10;
    } else if (fieldName === "brand" || fieldName === "model") {
      score += 6;
    } else if (
      fieldName === "address_line" ||
      fieldName === "postcode_line" ||
      fieldName === "city_line"
    ) {
      score += 8;
    } else if (fieldName === "country_line") {
      score += 2;
    }

    const lims = Array.isArray(limitations) ? limitations : [];
    if (
      lims.includes("address_block_ambiguous") &&
      ["customer_name", "address_line", "postcode_line", "city_line"].includes(fieldName)
    ) {
      score -= 3;
    }

    return score;
  }

  function chooseBestValue(fieldName, pages) {
    let bestValue = null;
    let bestMeta = null;
    let bestScore = -10000;

    for (const page of pages) {
      const observed = page.observed_fields || {};
      const limitations = Array.isArray(page.limitations) ? page.limitations : [];
      const value = observed[fieldName];
      const score = fieldScore(fieldName, value, page.page_num, limitations);

      if (score > bestScore) {
        bestScore = score;
        bestValue = value ?? null;
        bestMeta = {
          image_key: page.image_key || null,
          page_num: Number.isFinite(page.page_num) ? page.page_num : null,
          score,
        };
      }
    }

    if (bestScore < 0) {
      return { value: null, meta: null };
    }

    return { value: bestValue, meta: bestMeta };
  }

  function chooseBestRawCandidate(rawFieldName, approvedFieldName, pages) {
    let bestValue = null;
    let bestMeta = null;
    let bestScore = -10000;

    for (const page of pages) {
      const observed = page.observed_fields || {};
      const limitations = Array.isArray(page.limitations) ? page.limitations : [];

      const approved = observed[approvedFieldName];
      const rawValue = observed[rawFieldName];

      let score = -1;
      if (rawValue != null && approved != null) {
        score = 30;
      } else if (rawValue != null) {
        score = 15;
      }

      if (score < 0) continue;

      if (Number.isFinite(page.page_num)) {
        score += Math.max(0, 10 - page.page_num);
      }

      if (rawFieldName === "mid_candidate_raw" && limitations.includes("mid_candidate_rejected")) {
        score += 3;
      }
      if (rawFieldName === "serial_candidate_raw" && limitations.includes("serial_candidate_rejected")) {
        score += 3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestValue = rawValue ?? null;
        bestMeta = {
          image_key: page.image_key || null,
          page_num: Number.isFinite(page.page_num) ? page.page_num : null,
          score,
        };
      }
    }

    if (bestScore < 0) {
      return { value: null, meta: null };
    }

    return { value: bestValue, meta: bestMeta };
  }

  function aggregateInvoiceImageMultipage(pageResults, opts) {
    const input = Array.isArray(pageResults) ? pageResults : [];
    const expectedCustomerName = cleanLine(opts?.expected_customer_name || "") || null;

    const pages = input
      .map((item) => {
        const imageKey = imageKeyFromResult(item);
        const split = splitPageSuffix(imageKey);
        return {
          image_key: imageKey,
          page_num: split.page_num,
          observed_fields: normalizeObservedFields(item?.observed_fields || {}),
          limitations: Array.isArray(item?.limitations) ? item.limitations.slice() : [],
        };
      })
      .sort((a, b) => pageSortKey(a) - pageSortKey(b));

    const observed = emptyObservedFields();
    const field_sources = {};

    for (const fieldName of [
      "customer_name",
      "address_line",
      "postcode_line",
      "city_line",
      "country_line",
      "brand",
      "model",
      "serial_number",
      "mid_number",
    ]) {
      const picked = chooseBestValue(fieldName, pages);
      observed[fieldName] = picked.value;
      field_sources[fieldName] = picked.meta;
    }

    const serialRaw = chooseBestRawCandidate("serial_candidate_raw", "serial_number", pages);
    observed.serial_candidate_raw = serialRaw.value;
    field_sources.serial_candidate_raw = serialRaw.meta;

    const midRaw = chooseBestRawCandidate("mid_candidate_raw", "mid_number", pages);
    observed.mid_candidate_raw = midRaw.value;
    field_sources.mid_candidate_raw = midRaw.meta;

    const limitations = [];
    for (const page of pages) {
      for (const lim of page.limitations) {
        if (!limitations.includes(lim)) limitations.push(lim);
      }
    }

    const observedNonNullFields = Object.entries(observed)
      .filter(([, value]) => isNonEmpty(value))
      .length;

    return {
      parser_kind: "invoice_image_multipage_aggregate",
      parser_version: "2026-04-02-client-v1",
      source_kind: "image_multipage",
      observed_fields: observed,
      confidence: {
        observed_non_null_fields: observedNonNullFields,
        expected_customer_name: expectedCustomerName,
      },
      limitations,
      summary: {
        mode: "invoice_image_multipage_aggregate_client_v1",
        observed_non_null_fields: observedNonNullFields,
        source_pages: pages.map((p) => p.image_key),
      },
      field_sources,
      pages: pages.map((p) => ({
        image_key: p.image_key,
        page_num: p.page_num,
        limitations: p.limitations.slice(),
      })),
    };
  }

  function assessField(fieldName, expected, observedFields, limitations) {
    const approved = observedFields?.[fieldName] ?? null;
    const rawMap = {
      serial_number: observedFields?.serial_candidate_raw ?? null,
      mid_number: observedFields?.mid_candidate_raw ?? null,
    };
    const raw = rawMap[fieldName] ?? approved;
    const isLoadBearing = LOAD_BEARING_FIELDS.includes(fieldName);
    const lims = Array.isArray(limitations) ? limitations : [];

    if (expected == null) {
      if (approved == null) {
        return {
          field_name: fieldName,
          expected: null,
          observed_raw: raw,
          observed_approved: approved,
          status: "not_expected",
          reason: "no_expected_value",
          is_load_bearing: isLoadBearing,
        };
      }
      return {
        field_name: fieldName,
        expected: null,
        observed_raw: raw,
        observed_approved: approved,
        status: "extra_observed",
        reason: "value_observed_but_not_expected",
        is_load_bearing: isLoadBearing,
      };
    }

    if (approved != null) {
      if (valuesEqual(fieldName, expected, approved)) {
        return {
          field_name: fieldName,
          expected,
          observed_raw: raw,
          observed_approved: approved,
          status: "pass",
          reason: "expected_matches_observed",
          is_load_bearing: isLoadBearing,
        };
      }
      return {
        field_name: fieldName,
        expected,
        observed_raw: raw,
        observed_approved: approved,
        status: "fail",
        reason: "value_mismatch",
        is_load_bearing: isLoadBearing,
      };
    }

    if (fieldName === "mid_number" && raw && lims.includes("mid_candidate_rejected")) {
      return {
        field_name: fieldName,
        expected,
        observed_raw: raw,
        observed_approved: null,
        status: "inconclusive",
        reason: "candidate_rejected_noisy_or_invalid",
        is_load_bearing: isLoadBearing,
      };
    }

    if (fieldName === "serial_number" && raw && lims.includes("serial_candidate_rejected")) {
      return {
        field_name: fieldName,
        expected,
        observed_raw: raw,
        observed_approved: null,
        status: "inconclusive",
        reason: "candidate_rejected_noisy_or_invalid",
        is_load_bearing: isLoadBearing,
      };
    }

    return {
      field_name: fieldName,
      expected,
      observed_raw: raw,
      observed_approved: null,
      status: "inconclusive",
      reason: "missing_observed_value",
      is_load_bearing: isLoadBearing,
    };
  }

  window.ENVAL.invoice_contract = {
    LOAD_BEARING_FIELDS,
    ALL_FIELDS,
    emptyObservedFields,
    normalizeObservedFields,
    valuesEqual,
    aggregateInvoiceImageMultipage,
    assessField,
  };
})();