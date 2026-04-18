// assets/js/analyse/analyse_image_step_1_upload.js

// NON-module. Hangt onder window.ENVAL.image_step_1_upload

(function () {
  window.ENVAL = window.ENVAL || {};

  const C = window.ENVAL.image_step_1_constants || {};
  const P = window.ENVAL.image_step_1_precheck || {};

  function withJpgExtension(filename) {
    const name = String(filename || "upload").trim() || "upload";
    const base = name.replace(/\.[a-z0-9]+$/i, "");
    return `${base}.jpg`;
  }

  function isImageFile(file) {
    const t = String(file?.type || "").toLowerCase();
    const n = String(file?.name || "").toLowerCase();
    return (
      t === "image/jpeg" ||
      t === "image/png" ||
      t === "image/jpg" ||
      n.endsWith(".jpg") ||
      n.endsWith(".jpeg") ||
      n.endsWith(".png")
    );
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

  async function compressImageToJpeg(file, opts) {
    const maxDim = Number(opts?.maxDim || C.PHOTO_MAX_DIM_PX || 1600);
    const quality = Number(opts?.quality || C.PHOTO_JPEG_QUALITY || 0.78);

    const src = await fileToImageBitmapSafe(file);
    const w = Number(src.width || 0);
    const h = Number(src.height || 0);

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.drawImage(src, 0, 0, outW, outH);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image compress failed"))),
        "image/jpeg",
        quality
      );
    });

    try {
      src.close?.();
    } catch (_) {}

    return { blob, outW, outH, quality };
  }

  async function sha256FileHex(file) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function prepareUploadFile(file, docType) {
    const dt = String(docType || "").toLowerCase();

    let client_transform = {
      applied: false,
      kind: null,
      original_bytes: file.size,
      final_bytes: file.size,
      original_mime: file.type || null,
      final_mime: file.type || null,
      original_filename: file.name || null,
      final_filename: file.name || null,
      max_dim: null,
      quality: null,
      out_w: null,
      out_h: null,
    };

    if (dt !== "foto_laadpunt") {
      return { uploadFile: file, client_transform };
    }

    if (!isImageFile(file)) {
      return { uploadFile: file, client_transform };
    }

    const { blob, outW, outH } = await compressImageToJpeg(file, {
      maxDim: C.PHOTO_MAX_DIM_PX,
      quality: C.PHOTO_JPEG_QUALITY,
    });

    const newName = withJpgExtension(file.name);
    const uploadFile = new File([blob], newName, { type: "image/jpeg" });

    client_transform = {
      applied: true,
      kind: "image_downscale_jpeg",
      original_bytes: file.size,
      final_bytes: uploadFile.size,
      original_mime: file.type || null,
      final_mime: "image/jpeg",
      original_filename: file.name || null,
      final_filename: newName,
      max_dim: Number(C.PHOTO_MAX_DIM_PX || 1600),
      quality: Number(C.PHOTO_JPEG_QUALITY || 0.78),
      out_w: outW,
      out_h: outH,
    };

    return { uploadFile, client_transform };
  }

  async function prepareInvoiceImagePrecheck(file, docType) {
    return await P.runInvoiceImagePrecheck(file, { doc_type: docType });
  }

  function shouldBlockInvoiceUpload(precheckResult) {
    if (!P.shouldBlockInvoiceImagePrecheck) return false;
    return P.shouldBlockInvoiceImagePrecheck(precheckResult);
  }

  function summarizeInvoiceUploadPrecheck(precheckResult) {
    if (!P.summarizeInvoiceImagePrecheck) {
      return {
        block: false,
        title: "Factuur-afbeelding precheck",
        messages: [],
      };
    }

    return P.summarizeInvoiceImagePrecheck(precheckResult);
  }

  window.ENVAL.image_step_1_upload = {
    isImageFile,
    withJpgExtension,
    compressImageToJpeg,
    sha256FileHex,
    prepareUploadFile,
    prepareInvoiceImagePrecheck,
    shouldBlockInvoiceUpload,
    summarizeInvoiceUploadPrecheck,
  };
})();