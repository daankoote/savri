import type { LegalBundleDocument } from "./legalBundleDocument";
import type { LegalBundleExportPort } from "./legalBundleExportPort";

type DownloadAnchor = {
  click: () => void;
  download: string;
  href: string;
  rel: string;
  remove: () => void;
};

export type BrowserHtmlLegalBundleEnvironment = {
  appendAnchor: (anchor: DownloadAnchor) => void;
  createAnchor: () => DownloadAnchor;
  createObjectUrl: (blob: Blob) => string;
  openPreview: (url: string) => { opener: unknown } | null;
  revokeObjectUrl: (url: string) => void;
  scheduleRevoke: (callback: () => void) => void;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderBrowserHtmlLegalBundleV1(
  bundle: LegalBundleDocument,
): string {
  const sections = bundle.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      ${
    section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("\n")
  }
    </section>`).join("\n");
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(bundle.title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(bundle.title)}</h1>
    ${sections}
  </main>
</body>
</html>`;
}

function browserEnvironment(): BrowserHtmlLegalBundleEnvironment {
  return {
    appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
    createAnchor: () => document.createElement("a"),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    openPreview: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    scheduleRevoke: (callback) => window.setTimeout(callback, 60_000),
  };
}

function objectUrl(
  bundle: LegalBundleDocument,
  environment: BrowserHtmlLegalBundleEnvironment,
): string {
  return environment.createObjectUrl(
    new Blob([renderBrowserHtmlLegalBundleV1(bundle)], {
      type: "text/html;charset=utf-8",
    }),
  );
}

export function createBrowserHtmlLegalBundleV1(
  environment: BrowserHtmlLegalBundleEnvironment = browserEnvironment(),
): LegalBundleExportPort {
  return {
    preview(bundle) {
      const url = objectUrl(bundle, environment);
      const preview = environment.openPreview(url);
      if (preview) preview.opener = null;
      environment.scheduleRevoke(() => environment.revokeObjectUrl(url));
      return Boolean(preview);
    },
    download(bundle) {
      const url = objectUrl(bundle, environment);
      const anchor = environment.createAnchor();
      anchor.href = url;
      anchor.download = "enval-aanmelddocumenten.html";
      anchor.rel = "noopener noreferrer";
      environment.appendAnchor(anchor);
      anchor.click();
      anchor.remove();
      environment.scheduleRevoke(() => environment.revokeObjectUrl(url));
      return true;
    },
  };
}
