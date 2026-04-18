// assets/js/analyse/analyse_image_step_1_constants.js

// NON-module. Hangt onder window.ENVAL.image_step_1_constants

(function () {
  window.ENVAL = window.ENVAL || {};

  const constants = {
    PHOTO_MAX_DIM_PX: 1600,
    PHOTO_JPEG_QUALITY: 0.78,

    IMAGE_PRECHECK_MIN_WIDTH: 900,
    IMAGE_PRECHECK_MIN_HEIGHT: 1200,

    IMAGE_PRECHECK_REJECT_WIDTH: 600,
    IMAGE_PRECHECK_REJECT_HEIGHT: 800,
    IMAGE_PRECHECK_REJECT_MIN_BYTES: 50 * 1024,

    INVOICE_IMAGE_ALLOWED_EXT: ["png", "jpg", "jpeg"],
    INVOICE_IMAGE_ALLOWED_MIME: ["image/png", "image/jpeg"],

    MAX_ORIGINAL_BYTES: 25 * 1024 * 1024,
    MAX_FINAL_BYTES: 15 * 1024 * 1024,
  };

  window.ENVAL.image_step_1_constants = constants;
})();