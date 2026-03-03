/* /assets/js/pages/regelgeving.js */
/* 2026-03-02 — collage + modal (no inline scripts) */

(function () {
  "use strict";

  const gridEl = document.getElementById("regGrid");
  const modalEl = document.getElementById("regModal");
  const modalBodyEl = document.getElementById("regModalBody");
  const modalCloseBtn = document.getElementById("regModalClose");

  if (!gridEl || !modalEl || !modalBodyEl || !modalCloseBtn) return;

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stripWeirdCitations(md) {
    // Verwijder AI/citation tokens zoals:
    // :contentReference[oaicite:26]{index=26}
    return String(md).replace(/:contentReference\[[^\]]*?\]\{[^}]*?\}/g, "").trim();
  }

  function formatDateDDMMYYYY(iso) {
    // verwacht YYYY-MM-DD
    if (!iso || typeof iso !== "string") return "";
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const yyyy = m[1], mm = m[2], dd = m[3];
    return `${dd}-${mm}-${yyyy}`;
  }

  function normalizeSources(item) {
    // sources kan zijn:
    // - array van strings (urls)
    // - array van { label, url }
    const src = Array.isArray(item.sources) ? item.sources : [];
    return src
      .map((s) => {
        if (!s) return null;
        if (typeof s === "string") return { label: s, url: s };
        if (typeof s === "object" && s.url) return { label: s.label || s.url, url: s.url };
        return null;
      })
      .filter(Boolean);
  }

  // Super simpele MD -> HTML (headings + bullets + links)
  function mdToHtml(md) {
    md = stripWeirdCitations(md);

    const lines = md.split("\n");
    const out = [];
    let inUl = false;

    function closeUl() {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
    }

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (!line.trim()) {
        closeUl();
        continue;
      }

      if (line.startsWith("### ")) {
        closeUl();
        out.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`);
        continue;
      }
      if (line.startsWith("## ")) {
        closeUl();
        out.push(`<h2>${escapeHtml(line.slice(3).trim())}</h2>`);
        continue;
      }
      if (line.startsWith("# ")) {
        closeUl();
        out.push(`<h1>${escapeHtml(line.slice(2).trim())}</h1>`);
        continue;
      }

      // bullets
      if (line.startsWith("- ")) {
        if (!inUl) {
          out.push("<ul class='list'>");
          inUl = true;
        }
        out.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
        continue;
      }

      closeUl();

      // links: [text](url)
      const linkified = escapeHtml(line).replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_m, t, u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(t)}</a>`
      );

      out.push(`<p>${linkified}</p>`);
    }

    closeUl();
    return out.join("\n");
  }

  function setModalOpen(isOpen) {
    if (isOpen) {
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      modalCloseBtn.focus();
    } else {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }
  }

  function clearHash() {
    if (location.hash && location.hash.startsWith("#a=")) {
      history.replaceState(null, "", location.pathname);
    }
  }

  function escHandler(e) {
    if (e.key === "Escape") {
      setModalOpen(false);
      clearHash();
    }
  }

  function backdropHandler(e) {
    if (e.target === modalEl) {
      setModalOpen(false);
      clearHash();
    }
  }

  modalCloseBtn.addEventListener("click", () => {
    setModalOpen(false);
    clearHash();
  });
  modalEl.addEventListener("click", backdropHandler);
  document.addEventListener("keydown", escHandler);

  function sortArticles(items) {
    // Nieuwste eerst als date aanwezig (YYYY-MM-DD). Anders: volgorde in index.json.
    return items
      .map((it, idx) => ({ ...it, _idx: idx }))
      .sort((a, b) => {
        const ad = a.date ? Date.parse(a.date) : NaN;
        const bd = b.date ? Date.parse(b.date) : NaN;

        if (!Number.isNaN(ad) && !Number.isNaN(bd)) return bd - ad;
        if (!Number.isNaN(ad) && Number.isNaN(bd)) return -1;
        if (Number.isNaN(ad) && !Number.isNaN(bd)) return 1;
        return a._idx - b._idx;
      });
  }

  function renderCard(item) {
    const el = document.createElement("div");
    el.className = "reg-card";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Open: ${item.title || "artikel"}`);

    const cover = item.cover ? String(item.cover) : "";
    // Covers in de grid zijn decoratief (titel/abstract staan al op de card).
    // Alt leeg voorkomt dubbele/rommelige tekst bij load issues.
    const coverAltFinal = "";
    const badge = item.badge ? String(item.badge) : "";
    const dateTxt = formatDateDDMMYYYY(item.date);
    const sourceName = item.source_name ? String(item.source_name) : "";

    el.innerHTML = `
      ${cover ? `<img class="reg-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" />` : ""}
      <div class="reg-meta">
        ${badge ? `<div class="reg-badge">${escapeHtml(badge)}</div>` : ""}
      </div>

      <h3 class="reg-title">${escapeHtml(item.title || "")}</h3>
      <p class="reg-abstract">${escapeHtml(item.abstract || "")}</p>

      <div class="reg-foot">
        ${dateTxt ? `<div class="reg-date">${escapeHtml(dateTxt)}</div>` : ""}
        ${sourceName ? `<div class="reg-source">Bron: ${escapeHtml(sourceName)}</div>` : ""}
      </div>
    `;

    const open = () => openArticle(item);

    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    return el;
  }

  function renderSourcesBlock(item) {
    const sources = normalizeSources(item);
    if (!sources.length) return "";

    const lis = sources
      .map((s) => {
        const label = escapeHtml(s.label || s.url);
        const url = escapeHtml(s.url);
        return `<li><a href="${url}" target="_blank" rel="noopener">${label}</a></li>`;
      })
      .join("");

    return `
      <div class="reg-modal-section">
        <h2>Bronnen</h2>
        <ul class="list">${lis}</ul>
      </div>
    `;
  }

  async function openArticle(item) {
    try {
      modalBodyEl.innerHTML = "<p>Bezig met laden…</p>";
      setModalOpen(true);

      if (item.slug) {
        history.replaceState(null, "", `#a=${encodeURIComponent(item.slug)}`);
      }

      const res = await fetch(item.doc);
      if (!res.ok) throw new Error(`Artikel niet gevonden (${res.status})`);

      let md = await res.text();
      md = stripWeirdCitations(md);

      // Bouw modal-header (netjes, geen rommel)
      const dateTxt = formatDateDDMMYYYY(item.date);
      const sourceName = item.source_name ? String(item.source_name) : "";
      const badge = item.badge ? String(item.badge) : "";

      const headerHtml = `
        <div class="reg-modal-head">
          ${badge ? `<div class="reg-modal-badge">${escapeHtml(badge)}</div>` : ""}

          <div class="reg-modal-meta">
            ${dateTxt ? `<div class="reg-modal-date">${escapeHtml(dateTxt)}</div>` : ""}
            ${sourceName ? `<div class="reg-modal-source">Bron: ${escapeHtml(sourceName)}</div>` : ""}
          </div>

          <div class="reg-modal-divider"></div>

          <h1 class="reg-modal-title">${escapeHtml(item.title || "")}</h1>
          ${item.abstract ? `<p class="reg-modal-abstract">${escapeHtml(item.abstract)}</p>` : ""}
        </div>
      `;

      const bodyHtml = `<div class="reg-modal-article">${mdToHtml(md)}</div>`;
      const sourcesHtml = renderSourcesBlock(item);

      modalBodyEl.innerHTML = headerHtml + bodyHtml + sourcesHtml;
    } catch (e) {
      modalBodyEl.innerHTML = `<p>Kon artikel niet laden. (${escapeHtml(e.message)})</p>`;
    }
  }

  async function init() {
    try {
      const res = await fetch("/artikelen/index.json");
      if (!res.ok) throw new Error(`index.json ontbreekt of faalt (${res.status})`);

      const data = await res.json();
      const items = sortArticles(Array.isArray(data) ? data : data.items || []);

      gridEl.innerHTML = "";
      for (const it of items) gridEl.appendChild(renderCard(it));

      // NIET auto-openen, behalve bij expliciete hash
      const m = location.hash.match(/^#a=(.+)$/);
      if (m) {
        const slug = decodeURIComponent(m[1]);
        const found = items.find((x) => x.slug === slug);
        if (found) openArticle(found);
      }
    } catch (e) {
      gridEl.innerHTML = `<div class="card"><p>Regelgeving-blokken konden niet laden. (${escapeHtml(
        e.message
      )})</p></div>`;
    }
  }

  init();
})();