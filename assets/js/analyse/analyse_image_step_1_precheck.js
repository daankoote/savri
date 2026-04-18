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

  function buildDecision(meta) {
    const errors = [];
    const warnings = [];

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

    if (!width || !height) {
      pushUnique(errors, "image_dimensions_unavailable");
    }

    if (byteLength <= 0) {
      pushUnique(errors, "image_byte_length_invalid");
    }

    if (byteLength > 0 && byteLength < rejectMinBytes) {
      pushUnique(errors, "image_byte_length_too_low");
    }

    if (width > 0 && width < rejectWidth) {
      pushUnique(errors, "image_width_far_too_low");
    }

    if (height > 0 && height < rejectHeight) {
      pushUnique(errors, "image_height_far_too_low");
    }

    if (width > 0 && width < minWidth) {
      pushUnique(warnings, "image_width_low");
    }

    if (height > 0 && height < minHeight) {
      pushUnique(warnings, "image_height_low");
    }

    if (aspectRatio !== null) {
      if (aspectRatio > 2.2) {
        pushUnique(warnings, "image_aspect_ratio_too_wide_for_invoice");
      } else if (aspectRatio < 0.45) {
        pushUnique(warnings, "image_aspect_ratio_too_tall_for_invoice");
      }
    }

    // -----------------------------
    // Light content plausibility
    // -----------------------------
    // Niet OCR, wel check of er waarschijnlijk genoeg document-inhoud zichtbaar is.

    if (darkPixelRatio > 0 && darkPixelRatio < 0.006) {
      pushUnique(errors, "image_content_ink_very_low");
    } else if (darkPixelRatio > 0 && darkPixelRatio < 0.012) {
      pushUnique(warnings, "image_content_ink_low");
    }

    if (darkPixelRatioCenter > 0 && darkPixelRatioCenter < 0.004) {
      pushUnique(errors, "image_content_center_ink_very_low");
    } else if (darkPixelRatioCenter > 0 && darkPixelRatioCenter < 0.008) {
      pushUnique(warnings, "image_content_center_ink_low");
    }

    if (totalZones > 0 && filledZones < 3) {
      pushUnique(errors, "image_content_zone_coverage_very_low");
    } else if (totalZones > 0 && filledZoneRatio < 0.45) {
      pushUnique(warnings, "image_content_zone_coverage_low");
    }

    if (edgeDensityMean > 0 && edgeDensityMean < 8) {
      pushUnique(errors, "image_content_sharpness_very_low");
    } else if (edgeDensityMean > 0 && edgeDensityMean < 12) {
      pushUnique(warnings, "image_content_sharpness_low");
    }

    if (edgeDensityCenter > 0 && edgeDensityCenter < 6) {
      pushUnique(errors, "image_content_center_sharpness_very_low");
    } else if (edgeDensityCenter > 0 && edgeDensityCenter < 10) {
      pushUnique(warnings, "image_content_center_sharpness_low");
    }

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

    if (s === "image_content_ink_very_low") {
      return "Er is te weinig zichtbare tekst of documentinhoud in de afbeelding.";
    }
    if (s === "image_content_ink_low") {
      return "Er is weinig zichtbare tekst of documentinhoud in de afbeelding.";
    }
    if (s === "image_content_center_ink_very_low") {
      return "In het midden van de afbeelding is vrijwel geen bruikbare documentinhoud zichtbaar.";
    }
    if (s === "image_content_center_ink_low") {
      return "In het midden van de afbeelding is weinig bruikbare documentinhoud zichtbaar.";
    }
    if (s === "image_content_zone_coverage_very_low") {
      return "De afbeelding toont vermoedelijk slechts een klein deel van de factuur.";
    }
    if (s === "image_content_zone_coverage_low") {
      return "De factuur vult maar een beperkt deel van de afbeelding. Gebruik bij voorkeur een vollediger beeld.";
    }
    if (s === "image_content_sharpness_very_low") {
      return "De afbeelding is te onscherp voor betrouwbare factuurcontrole.";
    }
    if (s === "image_content_sharpness_low") {
      return "De afbeelding is aan de onscherpe kant. Kies bij voorkeur een scherper beeld.";
    }
    if (s === "image_content_center_sharpness_very_low") {
      return "Het centrale deel van de afbeelding is te onscherp voor betrouwbare factuurcontrole.";
    }
    if (s === "image_content_center_sharpness_low") {
      return "Het centrale deel van de afbeelding is aan de onscherpe kant.";
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