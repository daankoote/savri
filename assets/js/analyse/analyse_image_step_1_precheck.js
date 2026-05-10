// assets/js/analyse/analyse_image_step_1_precheck.js

// NON-module. Hangt onder window.ENVAL.image_step_1_precheck

(function () {
  window.ENVAL = window.ENVAL || {};

  const C = window.ENVAL.image_step_1_constants || {};

  function getFileExt(filename) {
    const name = String(filename || "").trim().toLowerCase();
    const parts = name.split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  }

  function isAllowedInvoiceImageFile(file) {
    const mime = String(file?.type || "").trim().toLowerCase();
    const ext = getFileExt(file?.name || "");

    const allowedMime = Array.isArray(C.INVOICE_IMAGE_ALLOWED_MIME)
      ? C.INVOICE_IMAGE_ALLOWED_MIME
      : [];

    const allowedExt = Array.isArray(C.INVOICE_IMAGE_ALLOWED_EXT)
      ? C.INVOICE_IMAGE_ALLOWED_EXT
      : [];

    return allowedMime.includes(mime) || allowedExt.includes(ext);
  }

  function isInvoiceImageDocType(docType) {
    return String(docType || "").trim().toLowerCase() === "factuur";
  }

  async function fileToImageBitmapSafe(file) {
    if (window.createImageBitmap) {
      return await createImageBitmap(file);
    }

    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image decode failed"));
      });

      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function calculateAspectRatio(width, height) {
    if (!width || !height) return null;
    return Number((width / height).toFixed(4));
  }

  function buildBaseMeta(file, dims) {
    return {
      filename: file?.name || null,
      content_type: String(file?.type || "").trim().toLowerCase() || null,
      ext: getFileExt(file?.name || ""),
      byte_length: Number(file?.size || 0) || 0,
      width: dims?.width || null,
      height: dims?.height || null,
      aspect_ratio: calculateAspectRatio(dims?.width || null, dims?.height || null),
    };
  }

  function clampInt(value, min, max) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function round4(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(4));
  }

  function createAnalysisCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Canvas context unavailable");
    return { canvas, ctx };
  }

  function toGray(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function buildVisualPrescanFromImageSource(src, originalWidth, originalHeight) {
    const maxAnalysisDim = clampInt(C.IMAGE_PRECHECK_ANALYSIS_MAX_DIM || 1000, 400, 1600);
    const zoneCols = clampInt(C.IMAGE_PRECHECK_ZONE_COLS || 3, 2, 6);
    const zoneRows = clampInt(C.IMAGE_PRECHECK_ZONE_ROWS || 4, 2, 8);

    const w = Number(originalWidth || 0);
    const h = Number(originalHeight || 0);

    if (!w || !h) {
      return {
        analysis_width: null,
        analysis_height: null,
        dark_pixel_ratio: 0,
        dark_pixel_ratio_center: 0,
        filled_zone_ratio: 0,
        filled_zones: 0,
        total_zones: zoneCols * zoneRows,
        edge_density_mean: 0,
        edge_density_center: 0,
      };
    }

    const scale = Math.min(1, maxAnalysisDim / Math.max(w, h));
    const analysisWidth = Math.max(1, Math.round(w * scale));
    const analysisHeight = Math.max(1, Math.round(h * scale));

    const { ctx } = createAnalysisCanvas(analysisWidth, analysisHeight);
    ctx.drawImage(src, 0, 0, analysisWidth, analysisHeight);

    const img = ctx.getImageData(0, 0, analysisWidth, analysisHeight);
    const data = img.data;

    const totalPixels = analysisWidth * analysisHeight;
    const gray = new Float32Array(totalPixels);

    let darkCount = 0;
    let edgeAccum = 0;
    let edgeCount = 0;

    const darkThreshold = Number(C.IMAGE_PRECHECK_DARK_THRESHOLD || 205);
    const zoneDarkThreshold = Number(C.IMAGE_PRECHECK_ZONE_DARK_THRESHOLD || 210);
    const zoneFillMinRatio = Number(C.IMAGE_PRECHECK_ZONE_FILL_MIN_RATIO || 0.012);

    const zoneCounts = new Array(zoneCols * zoneRows).fill(0);
    const zoneTotals = new Array(zoneCols * zoneRows).fill(0);

    const centerX1 = Math.floor(analysisWidth * 0.15);
    const centerX2 = Math.ceil(analysisWidth * 0.85);
    const centerY1 = Math.floor(analysisHeight * 0.15);
    const centerY2 = Math.ceil(analysisHeight * 0.85);

    let centerDarkCount = 0;
    let centerPixels = 0;
    let centerEdgeAccum = 0;
    let centerEdgeCount = 0;

    for (let y = 0; y < analysisHeight; y++) {
      for (let x = 0; x < analysisWidth; x++) {
        const idx = y * analysisWidth + x;
        const di = idx * 4;

        const g = toGray(data[di], data[di + 1], data[di + 2]);
        gray[idx] = g;

        if (g < darkThreshold) {
          darkCount++;
        }

        const zoneX = Math.min(zoneCols - 1, Math.floor((x / analysisWidth) * zoneCols));
        const zoneY = Math.min(zoneRows - 1, Math.floor((y / analysisHeight) * zoneRows));
        const zoneIdx = zoneY * zoneCols + zoneX;

        zoneTotals[zoneIdx] += 1;
        if (g < zoneDarkThreshold) {
          zoneCounts[zoneIdx] += 1;
        }

        const inCenter = x >= centerX1 && x < centerX2 && y >= centerY1 && y < centerY2;
        if (inCenter) {
          centerPixels++;
          if (g < darkThreshold) {
            centerDarkCount++;
          }
        }

        if (x > 0 || y > 0) {
          let grad = 0;

          if (x > 0) {
            grad += Math.abs(g - gray[idx - 1]);
          }
          if (y > 0) {
            grad += Math.abs(g - gray[idx - analysisWidth]);
          }

          edgeAccum += grad;
          edgeCount++;

          if (inCenter) {
            centerEdgeAccum += grad;
            centerEdgeCount++;
          }
        }
      }
    }

    let filledZones = 0;
    for (let i = 0; i < zoneCounts.length; i++) {
      const ratio = zoneTotals[i] > 0 ? zoneCounts[i] / zoneTotals[i] : 0;
      if (ratio >= zoneFillMinRatio) {
        filledZones++;
      }
    }

    return {
      analysis_width: analysisWidth,
      analysis_height: analysisHeight,
      dark_pixel_ratio: round4(totalPixels > 0 ? darkCount / totalPixels : 0),
      dark_pixel_ratio_center: round4(centerPixels > 0 ? centerDarkCount / centerPixels : 0),
      filled_zone_ratio: round4(zoneCounts.length > 0 ? filledZones / zoneCounts.length : 0),
      filled_zones: filledZones,
      total_zones: zoneCounts.length,
      edge_density_mean: round4(edgeCount > 0 ? edgeAccum / edgeCount : 0),
      edge_density_center: round4(centerEdgeCount > 0 ? centerEdgeAccum / centerEdgeCount : 0),
    };
  }

  async function readImageInspection(file) {
    const src = await fileToImageBitmapSafe(file);

    try {
      const width = Number(src.width || 0) || null;
      const height = Number(src.height || 0) || null;

      const visual = buildVisualPrescanFromImageSource(src, width, height);

      return {
        width,
        height,
        visual,
      };
    } finally {
      try {
        src.close?.();
      } catch (_) {}
    }
  }

  function pushUnique(arr, value) {
    if (!arr.includes(value)) arr.push(value);
  }

  function addRule(ruleResults, args) {
    ruleResults.push({
      code: String(args.code || "").trim(),
      level: String(args.level || "warn").trim(),
      measured_value: args.measured_value ?? null,
      threshold: args.threshold ?? null,
      operator: String(args.operator || "").trim() || null,
      triggered: args.triggered === true,
      metric: String(args.metric || "").trim() || null,
      note: String(args.note || "").trim() || null,
    });
  }

  function buildDecision(meta) {
    const errors = [];
    const warnings = [];
    const rule_results = [];

    const minWidth = Number(C.IMAGE_PRECHECK_MIN_WIDTH || 900);
    const minHeight = Number(C.IMAGE_PRECHECK_MIN_HEIGHT || 1200);

    const rejectWidth = Number(C.IMAGE_PRECHECK_REJECT_WIDTH || 600);
    const rejectHeight = Number(C.IMAGE_PRECHECK_REJECT_HEIGHT || 800);
    const rejectMinBytes = Number(C.IMAGE_PRECHECK_REJECT_MIN_BYTES || 50 * 1024);

    const width = Number(meta.width || 0);
    const height = Number(meta.height || 0);
    const byteLength = Number(meta.byte_length || 0);
    const aspectRatio = meta.aspect_ratio;

    const visual = meta.visual_prescan || {};
    const darkPixelRatio = Number(visual.dark_pixel_ratio || 0);
    const darkPixelRatioCenter = Number(visual.dark_pixel_ratio_center || 0);
    const filledZoneRatio = Number(visual.filled_zone_ratio || 0);
    const filledZones = Number(visual.filled_zones || 0);
    const totalZones = Number(visual.total_zones || 0);
    const edgeDensityMean = Number(visual.edge_density_mean || 0);
    const edgeDensityCenter = Number(visual.edge_density_center || 0);

    const noDimensions = !width || !height;
    addRule(rule_results, {
      code: "image_dimensions_unavailable",
      level: "reject",
      measured_value: { width, height },
      threshold: "width>0 && height>0",
      operator: "required",
      triggered: noDimensions,
      metric: "dimensions",
      note: "Afmetingen moeten beschikbaar zijn.",
    });
    if (noDimensions) {
      pushUnique(errors, "image_dimensions_unavailable");
    }

    const invalidByteLength = byteLength <= 0;
    addRule(rule_results, {
      code: "image_byte_length_invalid",
      level: "reject",
      measured_value: byteLength,
      threshold: 0,
      operator: "<=",
      triggered: invalidByteLength,
      metric: "byte_length",
      note: "Bestand mag niet leeg of technisch ongeldig zijn.",
    });
    if (invalidByteLength) {
      pushUnique(errors, "image_byte_length_invalid");
    }

    const tooFewBytes = byteLength > 0 && byteLength < rejectMinBytes;
    addRule(rule_results, {
      code: "image_byte_length_too_low",
      level: "reject",
      measured_value: byteLength,
      threshold: rejectMinBytes,
      operator: "<",
      triggered: tooFewBytes,
      metric: "byte_length",
      note: "Bestand is te klein voor betrouwbare precheck.",
    });
    if (tooFewBytes) {
      pushUnique(errors, "image_byte_length_too_low");
    }

    const widthFarTooLow = width > 0 && width < rejectWidth;
    addRule(rule_results, {
      code: "image_width_far_too_low",
      level: "reject",
      measured_value: width,
      threshold: rejectWidth,
      operator: "<",
      triggered: widthFarTooLow,
      metric: "width",
      note: "Breedte is te laag voor zinvolle factuurcontrole.",
    });
    if (widthFarTooLow) {
      pushUnique(errors, "image_width_far_too_low");
    }

    const heightFarTooLow = height > 0 && height < rejectHeight;
    addRule(rule_results, {
      code: "image_height_far_too_low",
      level: "reject",
      measured_value: height,
      threshold: rejectHeight,
      operator: "<",
      triggered: heightFarTooLow,
      metric: "height",
      note: "Hoogte is te laag voor zinvolle factuurcontrole.",
    });
    if (heightFarTooLow) {
      pushUnique(errors, "image_height_far_too_low");
    }

    const widthLow = width > 0 && width < minWidth;
    addRule(rule_results, {
      code: "image_width_low",
      level: "warn",
      measured_value: width,
      threshold: minWidth,
      operator: "<",
      triggered: widthLow,
      metric: "width",
      note: "Breedte is beperkt; extractie kan instabiel worden.",
    });
    if (widthLow) {
      pushUnique(warnings, "image_width_low");
    }

    const heightLow = height > 0 && height < minHeight;
    addRule(rule_results, {
      code: "image_height_low",
      level: "warn",
      measured_value: height,
      threshold: minHeight,
      operator: "<",
      triggered: heightLow,
      metric: "height",
      note: "Hoogte is beperkt; extractie kan instabiel worden.",
    });
    if (heightLow) {
      pushUnique(warnings, "image_height_low");
    }

    const aspectTooWide = aspectRatio !== null && aspectRatio > 2.2;
    addRule(rule_results, {
      code: "image_aspect_ratio_too_wide_for_invoice",
      level: "warn",
      measured_value: aspectRatio,
      threshold: 2.2,
      operator: ">",
      triggered: aspectTooWide,
      metric: "aspect_ratio",
      note: "Afbeelding is ongebruikelijk breed voor een volledige factuur.",
    });
    if (aspectTooWide) {
      pushUnique(warnings, "image_aspect_ratio_too_wide_for_invoice");
    }

    const aspectTooTall = aspectRatio !== null && aspectRatio < 0.45;
    addRule(rule_results, {
      code: "image_aspect_ratio_too_tall_for_invoice",
      level: "warn",
      measured_value: aspectRatio,
      threshold: 0.45,
      operator: "<",
      triggered: aspectTooTall,
      metric: "aspect_ratio",
      note: "Afbeelding is ongebruikelijk smal/hoog voor een volledige factuur.",
    });
    if (aspectTooTall) {
      pushUnique(warnings, "image_aspect_ratio_too_tall_for_invoice");
    }

    // ------------------------------------------------------
    // Content heuristics: CURRENT alleen observability.
    // Niet user-facing beslissend, om warn-ruis te voorkomen.
    // ------------------------------------------------------

    addRule(rule_results, {
      code: "image_content_ink_very_low",
      level: "info",
      measured_value: darkPixelRatio,
      threshold: 0.006,
      operator: "<",
      triggered: darkPixelRatio > 0 && darkPixelRatio < 0.006,
      metric: "dark_pixel_ratio",
      note: "Observability only. Zeer lage donkere-pixel-ratio.",
    });

    addRule(rule_results, {
      code: "image_content_ink_low",
      level: "info",
      measured_value: darkPixelRatio,
      threshold: 0.012,
      operator: "<",
      triggered: darkPixelRatio >= 0.006 && darkPixelRatio < 0.012,
      metric: "dark_pixel_ratio",
      note: "Observability only. Lage donkere-pixel-ratio.",
    });

    addRule(rule_results, {
      code: "image_content_center_ink_very_low",
      level: "info",
      measured_value: darkPixelRatioCenter,
      threshold: 0.004,
      operator: "<",
      triggered: darkPixelRatioCenter > 0 && darkPixelRatioCenter < 0.004,
      metric: "dark_pixel_ratio_center",
      note: "Observability only. Zeer lage centrale donkere-pixel-ratio.",
    });

    addRule(rule_results, {
      code: "image_content_center_ink_low",
      level: "info",
      measured_value: darkPixelRatioCenter,
      threshold: 0.008,
      operator: "<",
      triggered: darkPixelRatioCenter >= 0.004 && darkPixelRatioCenter < 0.008,
      metric: "dark_pixel_ratio_center",
      note: "Observability only. Lage centrale donkere-pixel-ratio.",
    });

    addRule(rule_results, {
      code: "image_content_zone_coverage_very_low",
      level: "info",
      measured_value: filledZones,
      threshold: 3,
      operator: "<",
      triggered: totalZones > 0 && filledZones < 3,
      metric: "filled_zones",
      note: "Observability only. Weinig zones met zichtbare inhoud.",
    });

    addRule(rule_results, {
      code: "image_content_zone_coverage_low",
      level: "info",
      measured_value: filledZoneRatio,
      threshold: 0.45,
      operator: "<",
      triggered: totalZones > 0 && filledZones >= 3 && filledZoneRatio < 0.45,
      metric: "filled_zone_ratio",
      note: "Observability only. Lage spreiding van inhoud over het canvas.",
    });

    addRule(rule_results, {
      code: "image_content_sharpness_very_low",
      level: "info",
      measured_value: edgeDensityMean,
      threshold: 8,
      operator: "<",
      triggered: edgeDensityMean > 0 && edgeDensityMean < 8,
      metric: "edge_density_mean",
      note: "Observability only. Lage globale randdichtheid.",
    });

    addRule(rule_results, {
      code: "image_content_sharpness_low",
      level: "info",
      measured_value: edgeDensityMean,
      threshold: 12,
      operator: "<",
      triggered: edgeDensityMean >= 8 && edgeDensityMean < 12,
      metric: "edge_density_mean",
      note: "Observability only. Matige globale randdichtheid.",
    });

    addRule(rule_results, {
      code: "image_content_center_sharpness_very_low",
      level: "info",
      measured_value: edgeDensityCenter,
      threshold: 6,
      operator: "<",
      triggered: edgeDensityCenter > 0 && edgeDensityCenter < 6,
      metric: "edge_density_center",
      note: "Observability only. Lage centrale randdichtheid.",
    });

    addRule(rule_results, {
      code: "image_content_center_sharpness_low",
      level: "info",
      measured_value: edgeDensityCenter,
      threshold: 10,
      operator: "<",
      triggered: edgeDensityCenter >= 6 && edgeDensityCenter < 10,
      metric: "edge_density_center",
      note: "Observability only. Matige centrale randdichtheid.",
    });

    const decision =
      errors.length > 0
        ? "reject"
        : warnings.length > 0
          ? "warn"
          : "allow";

    return {
      decision,
      errors,
      warnings,
      rule_results,
    };
  }

  function shouldBlockInvoiceImagePrecheck(result) {
    if (!result || typeof result !== "object") return true;
    return String(result.decision || "").toLowerCase() === "reject";
  }

  function shouldContinueInvoiceImagePrecheck(result) {
    return !shouldBlockInvoiceImagePrecheck(result);
  }

  function humanizeInvoiceImageIssue(code) {
    const s = String(code || "").trim();

    if (s === "unsupported_invoice_image_type") {
      return "Bestandstype voor factuurafbeelding wordt niet ondersteund.";
    }
    if (s === "missing_file") {
      return "Geen bestand geselecteerd.";
    }
    if (s === "image_decode_failed") {
      return "Afbeelding kon niet worden gelezen.";
    }
    if (s === "image_dimensions_unavailable") {
      return "Afmetingen van de afbeelding konden niet worden bepaald.";
    }
    if (s === "image_byte_length_invalid") {
      return "Bestandsgrootte is ongeldig.";
    }
    if (s === "image_byte_length_too_low") {
      return "Afbeelding is vermoedelijk te klein of te sterk gecomprimeerd.";
    }
    if (s === "image_width_far_too_low") {
      return "Afbeelding is te smal voor betrouwbare factuurcontrole.";
    }
    if (s === "image_height_far_too_low") {
      return "Afbeelding is te laag voor betrouwbare factuurcontrole.";
    }
    if (s === "image_width_low") {
      return "Afbeelding is aan de smalle kant. Kies bij voorkeur een scherper of groter beeld.";
    }
    if (s === "image_height_low") {
      return "Afbeelding is aan de lage kant. Kies bij voorkeur een scherper of groter beeld.";
    }
    if (s === "image_aspect_ratio_too_wide_for_invoice") {
      return "Afbeelding is ongebruikelijk breed voor een volledige factuur.";
    }
    if (s === "image_aspect_ratio_too_tall_for_invoice") {
      return "Afbeelding is ongebruikelijk smal/hoog voor een volledige factuur.";
    }

    return s || "Onbekende precheck-uitkomst.";
  }

  function summarizeInvoiceImagePrecheck(result) {
    if (!result || typeof result !== "object") {
      return {
        block: true,
        title: "Factuurafbeelding afgekeurd",
        messages: ["Precheck-resultaat ontbreekt of is ongeldig."],
      };
    }

    const errors = Array.isArray(result.errors) ? result.errors : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const block = shouldBlockInvoiceImagePrecheck(result);

    return {
      block,
      title: block
        ? "Factuurafbeelding afgekeurd"
        : warnings.length
          ? "Factuurafbeelding twijfelachtig"
          : "Factuurafbeelding akkoord",
      messages: [...errors, ...warnings].map(humanizeInvoiceImageIssue),
    };
  }

  async function runInvoiceImagePrecheck(file, opts) {
    const docType = String(opts?.doc_type || "").trim().toLowerCase();

    if (!isInvoiceImageDocType(docType)) {
      return {
        ok: false,
        decision: "reject",
        reason: "doc_type_not_invoice",
        meta: {},
        warnings: [],
        errors: ["doc_type_not_invoice"],
        rule_results: [],
      };
    }

    if (!file) {
      return {
        ok: false,
        decision: "reject",
        reason: "missing_file",
        meta: {},
        warnings: [],
        errors: ["missing_file"],
        rule_results: [],
      };
    }

    if (!isAllowedInvoiceImageFile(file)) {
      return {
        ok: false,
        decision: "reject",
        reason: "unsupported_invoice_image_type",
        meta: {
          filename: file.name || null,
          content_type: String(file.type || "").trim().toLowerCase() || null,
          ext: getFileExt(file.name || ""),
          byte_length: Number(file.size || 0) || 0,
          width: null,
          height: null,
          aspect_ratio: null,
          visual_prescan: null,
        },
        warnings: [],
        errors: ["unsupported_invoice_image_type"],
        rule_results: [],
      };
    }

    let inspection;
    try {
      inspection = await readImageInspection(file);
    } catch (_) {
      return {
        ok: false,
        decision: "reject",
        reason: "image_decode_failed",
        meta: {
          filename: file.name || null,
          content_type: String(file.type || "").trim().toLowerCase() || null,
          ext: getFileExt(file.name || ""),
          byte_length: Number(file.size || 0) || 0,
          width: null,
          height: null,
          aspect_ratio: null,
          visual_prescan: null,
        },
        warnings: [],
        errors: ["image_decode_failed"],
        rule_results: [],
      };
    }

    const meta = buildBaseMeta(file, {
      width: inspection.width,
      height: inspection.height,
    });

    meta.visual_prescan = inspection.visual || null;

    const decisionResult = buildDecision(meta);

    return {
      ok: true,
      decision: decisionResult.decision,
      reason:
        decisionResult.decision === "reject"
          ? "invoice_image_precheck_reject"
          : decisionResult.decision === "warn"
            ? "invoice_image_precheck_warn"
            : "invoice_image_precheck_allow",
      meta,
      warnings: decisionResult.warnings,
      errors: decisionResult.errors,
      rule_results: decisionResult.rule_results,
    };
  }

  window.ENVAL.image_step_1_precheck = {
    getFileExt,
    isAllowedInvoiceImageFile,
    isInvoiceImageDocType,
    runInvoiceImagePrecheck,
    shouldBlockInvoiceImagePrecheck,
    shouldContinueInvoiceImagePrecheck,
    humanizeInvoiceImageIssue,
    summarizeInvoiceImagePrecheck,
  };
})();