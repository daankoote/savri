import { type ReactNode, useEffect, useState } from "react";
import type { PublicPresentationBrandV1 } from "../../../../platform/runtime/presentation/presentation_brand_config.ts";
import { PresentationBrandProvider } from "./PresentationBrandProvider";
import {
  loadPresentationBootstrap,
  type PresentationBootstrapResult,
} from "./presentationBootstrapClient";

type RuntimeState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; presentation: PublicPresentationBrandV1 }>
  | Readonly<{ status: "error" }>;

let bootstrapPromise: Promise<PresentationBootstrapResult> | null = null;

function currentBootstrap(): Promise<PresentationBootstrapResult> {
  bootstrapPromise ??= loadPresentationBootstrap();
  return bootstrapPromise;
}

export function PresentationBrandRuntime(
  { children }: { children: ReactNode },
) {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    currentBootstrap().then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { status: "ready", presentation: result.presentation }
          : { status: "error" },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    document.title =
      `${state.presentation.displayName} ${state.presentation.productLabel}`;
    const favicon = state.presentation.assets.favicon;
    if (!favicon) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.append(link);
    }
    link.href = favicon;
  }, [state]);

  if (state.status === "loading") {
    return (
      <main className="page-shell">
        <section className="section">
          <div className="container">
            <div className="review-panel" role="status" aria-live="polite">
              <h3>Laden</h3>
              <p>Even geduld.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="page-shell">
        <section className="section">
          <div className="container">
            <div className="review-panel" role="alert">
              <h3>Tijdelijk niet beschikbaar</h3>
              <p>Probeer het later opnieuw.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }
  return (
    <PresentationBrandProvider presentation={state.presentation}>
      {children}
    </PresentationBrandProvider>
  );
}
