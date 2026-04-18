// /assets/js/analyse/analyse_verify_payload.js
// Client-side verify payload orchestration.
// Doel:
// - declared snapshot uit huidig dossier/chargers/documents samenstellen
// - client-side upload metadata tijdelijk bijhouden
// - later client parserobservaties (pdf/jpg) kunnen registreren
// - verify request body opbouwen zonder dit in dossier.js te proppen

(function () {
  const NS = (window.ENVAL = window.ENVAL || {});

  const state = {
    currentSnapshot: null,
    uploadedDocumentsById: {},   // document_id -> metadata
    invoiceObservedByDocumentId: {}, // document_id -> parser output
    invoiceImagePagesByGroupKey: {}, // group_key -> [{ document_id, ...page payload }]
  };

  function cloneJsonSafe(value) {
    return value == null
      ? value
      : JSON.parse(JSON.stringify(value));
  }

  function cleanStr(value) {
    const s = String(value || "").trim();
    return s || null;
  }

  function normalizeDocType(value) {
    return cleanStr(value)?.toLowerCase() || null;
  }

  function normalizeContentType(value) {
    return cleanStr(value)?.toLowerCase() || null;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function buildDeclaredDossierSnapshot(current) {
    const dossier = current?.dossier || {};

    return {
      dossier_id: cleanStr(dossier.id) || null,
      address: {
        postcode: cleanStr(dossier.address_postcode),
        house_number: cleanStr(dossier.address_house_number),
        suffix: cleanStr(dossier.address_suffix),
        street: cleanStr(dossier.address_street),
        city: cleanStr(dossier.address_city),
      },
      customer: {
        first_name: cleanStr(
          dossier.customer_first_name ||
          dossier.first_name ||
          dossier.voornaam
        ),
        last_name: cleanStr(
          dossier.customer_last_name ||
          dossier.last_name ||
          dossier.achternaam
        ),
        email: cleanStr(
          dossier.customer_email ||
          dossier.email ||
          dossier.contact_email
        ),
        phone: cleanStr(dossier.customer_phone),
      },
      status: cleanStr(dossier.status),
      locked_at: cleanStr(dossier.locked_at),
    };
  }

  function buildDeclaredChargersSnapshot(current) {
    const chargers = safeArray(current?.chargers);

    return chargers.map((charger) => ({
      charger_id: cleanStr(charger.id),
      brand: cleanStr(charger.brand),
      model: cleanStr(charger.model),
      serial_number: cleanStr(charger.serial_number),
      mid_number: cleanStr(charger.mid_number),
      notes: cleanStr(charger.notes),
    }));
  }

  function buildServerDocumentsSnapshot(current) {
    const docs = safeArray(current?.documents);

    return docs.map((doc) => ({
      document_id: cleanStr(doc.id),
      charger_id: cleanStr(doc.charger_id),
      doc_type: normalizeDocType(doc.doc_type),
      filename: cleanStr(doc.filename),
      content_type: normalizeContentType(doc.content_type),
      size_bytes: Number.isFinite(Number(doc.size_bytes)) ? Number(doc.size_bytes) : null,
      status: cleanStr(doc.status),
      file_sha256: cleanStr(doc.file_sha256),
      source: "server",
    }));
  }

  function getServerDocumentIdSet() {
    const docs = safeArray(state.currentSnapshot?.documents);
    const out = new Set();

    for (const doc of docs) {
      const id = cleanStr(doc?.id);
      if (id) out.add(id);
    }

    return out;
  }

  function buildUploadedDocumentsSnapshot() {
    const serverDocumentIds = getServerDocumentIdSet();

    return Object.values(state.uploadedDocumentsById)
      .filter((doc) => {
        const id = cleanStr(doc?.document_id);
        return !!id && !serverDocumentIds.has(id);
      })
      .map((doc) => cloneJsonSafe(doc))
      .sort((a, b) => String(a.document_id || "").localeCompare(String(b.document_id || "")));
  }

  function buildClientObservedSnapshot() {
    const serverDocumentIds = getServerDocumentIdSet();
    const uploadedDocumentIds = new Set(
      Object.keys(state.uploadedDocumentsById).map((x) => cleanStr(x)).filter(Boolean)
    );

    const out = Object.entries(state.invoiceObservedByDocumentId)
    .filter(([document_id]) => {
      const id = cleanStr(document_id);
      return !!id && (serverDocumentIds.has(id) || uploadedDocumentIds.has(id));
    })
    .map(([document_id, payload]) => ({
      document_id,
      source: "client_parser",
      parser_payload: cloneJsonSafe(payload),
    }))
    .sort((a, b) => String(a.document_id || "").localeCompare(String(b.document_id || "")));

    console.log("VERIFY buildClientObservedSnapshot", out);

    return out;
  }

    function buildExpectedCustomerName() {
    const dossier = state.currentSnapshot?.dossier || {};

    const firstName = cleanStr(
      dossier.customer_first_name ||
      dossier.first_name ||
      dossier.voornaam
    );

    const lastName = cleanStr(
      dossier.customer_last_name ||
      dossier.last_name ||
      dossier.achternaam
    );

    return cleanStr([firstName, lastName].filter(Boolean).join(" "));
  }

  function clearInvoiceObservedResult(document_id) {
    const id = cleanStr(document_id);
    if (!id) return;
    delete state.invoiceObservedByDocumentId[id];
  }

  async function maybeParseAndRegisterInvoiceDocument(input) {
    const parser = window.ENVAL?.invoice_parser || null;

    const document_id = cleanStr(input?.document_id);
    const doc_type = normalizeDocType(input?.doc_type);
    const content_type = normalizeContentType(input?.content_type);
    const filename = cleanStr(input?.filename);
    const file = input?.file || null;

    if (!document_id) {
      throw new Error("maybeParseAndRegisterInvoiceDocument: missing document_id");
    }

    if (doc_type !== "factuur") {
      return {
        skipped: true,
        reason: "doc_type_not_factuur",
        document_id,
        filename,
      };
    }

    if (content_type !== "application/pdf") {
      return {
        skipped: true,
        reason: "browser_pdf_lane_only",
        document_id,
        filename,
        content_type,
      };
    }

    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("maybeParseAndRegisterInvoiceDocument: missing pdf File object");
    }

    if (!parser?.parseInvoicePdfFile) {
      throw new Error("maybeParseAndRegisterInvoiceDocument: invoice_parser.parseInvoicePdfFile missing");
    }

    const parsed = await parser.parseInvoicePdfFile(file, {
      expected_customer_name: buildExpectedCustomerName(),
    });

    registerInvoiceObservedResult({
      document_id,
      parser_kind: parsed?.parser_kind,
      parser_version: parsed?.parser_version,
      source_kind: parsed?.source_kind,
      observed_fields: parsed?.observed_fields || {},
      confidence: parsed?.confidence || {},
      limitations: parsed?.limitations || [],
      summary: parsed?.summary || {},
      field_sources: parsed?.field_sources || null,
      pages: parsed?.pages || null,
    });

    return {
      skipped: false,
      document_id,
      filename,
      parser_result: cloneJsonSafe(parsed),
    };
  }

  function syncCurrentSnapshot(current) {
    state.currentSnapshot = cloneJsonSafe(current || null);
  }

  function reset() {
    state.currentSnapshot = null;
    state.uploadedDocumentsById = {};
    state.invoiceObservedByDocumentId = {};
    state.invoiceImagePagesByGroupKey = {};
  }

  function registerUploadedDocument(input) {
    const document_id = cleanStr(input?.document_id);
    if (!document_id) {
      throw new Error("registerUploadedDocument: missing document_id");
    }

    state.uploadedDocumentsById[document_id] = {
      document_id,
      charger_id: cleanStr(input?.charger_id),
      doc_type: normalizeDocType(input?.doc_type),
      filename: cleanStr(input?.filename),
      content_type: normalizeContentType(input?.content_type),
      size_bytes: Number.isFinite(Number(input?.size_bytes)) ? Number(input.size_bytes) : null,
      file_sha256: cleanStr(input?.file_sha256),
      client_transform: cloneJsonSafe(input?.client_transform || null),
      source: "client_upload",
    };
  }

  function removeUploadedDocument(document_id) {
    const id = cleanStr(document_id);
    if (!id) return;

    delete state.uploadedDocumentsById[id];
    clearInvoiceObservedResult(id);

    for (const groupKey of Object.keys(state.invoiceImagePagesByGroupKey)) {
      const arr = Array.isArray(state.invoiceImagePagesByGroupKey[groupKey])
        ? state.invoiceImagePagesByGroupKey[groupKey]
        : [];

      const filtered = arr.filter((page) => cleanStr(page?.document_id) !== id);

      if (filtered.length > 0) {
        state.invoiceImagePagesByGroupKey[groupKey] = filtered;
      } else {
        delete state.invoiceImagePagesByGroupKey[groupKey];
      }
    }
  }

  function registerInvoiceObservedResult(input) {
    const invoiceContract = window.ENVAL?.invoice_contract || null;
    const document_id = cleanStr(input?.document_id);
    console.log("VERIFY registerInvoiceObservedResult", {
      document_id,
      input,
    });
    if (!document_id) {
      throw new Error("registerInvoiceObservedResult: missing document_id");
    }

    state.invoiceObservedByDocumentId[document_id] = {
      parser_kind: cleanStr(input?.parser_kind),
      parser_version: cleanStr(input?.parser_version),
      source_kind: cleanStr(input?.source_kind), // pdf | image | image_multipage
      observed_fields: invoiceContract?.normalizeObservedFields
        ? invoiceContract.normalizeObservedFields(input?.observed_fields || {})
        : cloneJsonSafe(input?.observed_fields || {}),
      confidence: cloneJsonSafe(input?.confidence || {}),
      limitations: safeArray(input?.limitations).map((x) => String(x)),
      summary: cloneJsonSafe(input?.summary || {}),
      field_sources: cloneJsonSafe(input?.field_sources || null),
      pages: cloneJsonSafe(input?.pages || null),
    };
  }

  function registerInvoiceImagePageResult(input) {
    const group_key = cleanStr(input?.group_key);
    const document_id = cleanStr(input?.document_id);

    if (!group_key) {
      throw new Error("registerInvoiceImagePageResult: missing group_key");
    }
    if (!document_id) {
      throw new Error("registerInvoiceImagePageResult: missing document_id");
    }

    if (!Array.isArray(state.invoiceImagePagesByGroupKey[group_key])) {
      state.invoiceImagePagesByGroupKey[group_key] = [];
    }

    state.invoiceImagePagesByGroupKey[group_key].push({
      document_id,
      image_path: cleanStr(input?.image_path),
      imageKey: cleanStr(input?.imageKey),
      observed_fields: cloneJsonSafe(input?.observed_fields || {}),
      limitations: safeArray(input?.limitations).map((x) => String(x)),
      summary: cloneJsonSafe(input?.summary || {}),
      page_num: Number.isFinite(Number(input?.page_num)) ? Number(input.page_num) : null,
    });
  }

  function finalizeInvoiceImageMultipageGroup(input) {
    const invoiceContract = window.ENVAL?.invoice_contract || null;
    if (!invoiceContract?.aggregateInvoiceImageMultipage) {
      throw new Error("finalizeInvoiceImageMultipageGroup: invoice_contract missing");
    }

    const group_key = cleanStr(input?.group_key);
    const target_document_id = cleanStr(input?.target_document_id);

    if (!group_key) {
      throw new Error("finalizeInvoiceImageMultipageGroup: missing group_key");
    }
    if (!target_document_id) {
      throw new Error("finalizeInvoiceImageMultipageGroup: missing target_document_id");
    }

    const pages = Array.isArray(state.invoiceImagePagesByGroupKey[group_key])
      ? state.invoiceImagePagesByGroupKey[group_key]
      : [];

    const aggregated = invoiceContract.aggregateInvoiceImageMultipage(pages, {
      expected_customer_name: cleanStr(input?.expected_customer_name),
    });

    registerInvoiceObservedResult({
      document_id: target_document_id,
      parser_kind: aggregated.parser_kind,
      parser_version: aggregated.parser_version,
      source_kind: aggregated.source_kind,
      observed_fields: aggregated.observed_fields,
      confidence: aggregated.confidence,
      limitations: aggregated.limitations,
      summary: aggregated.summary,
      field_sources: aggregated.field_sources,
      pages: aggregated.pages,
    });

    return cloneJsonSafe(aggregated);
  }

  function buildVerifyExtra(args) {
    const mode = cleanStr(args?.mode) || "refresh";
    const snapshot = state.currentSnapshot || null;

    return {
      mode,
      client_verify_payload: {
        version: "enval-client-verify-payload.v1",
        declared_snapshot: {
          dossier: buildDeclaredDossierSnapshot(snapshot),
          chargers: buildDeclaredChargersSnapshot(snapshot),
        },
        document_snapshot: {
          from_server: buildServerDocumentsSnapshot(snapshot),
          from_client_uploads: buildUploadedDocumentsSnapshot(),
          client_invoice_observed: buildClientObservedSnapshot(),
        },
      },
    };
  }

  NS.verify_payload = {
    reset,
    syncCurrentSnapshot,
    registerUploadedDocument,
    removeUploadedDocument,
    clearInvoiceObservedResult,
    registerInvoiceObservedResult,
    maybeParseAndRegisterInvoiceDocument,
    registerInvoiceImagePageResult,
    finalizeInvoiceImageMultipageGroup,
    buildVerifyExtra,
  };
})();