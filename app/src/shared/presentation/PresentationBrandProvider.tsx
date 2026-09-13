import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  projectPresentationBrand,
  type PublicPresentationBrandV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";

export type PresentationIdentitySurface =
  | "public_auth"
  | "tenant_customer"
  | "tenant_operator";

export type PresentationSurfaceIdentity = Readonly<{
  contextLabel: "Inloggen" | "Klantportaal" | "Dossierbeheer";
  organizationName: string;
  shortMark: string;
}>;

const SURFACE_CONTEXT_LABELS = Object.freeze(
  {
    public_auth: "Inloggen",
    tenant_customer: "Klantportaal",
    tenant_operator: "Dossierbeheer",
  } as const satisfies Record<PresentationIdentitySurface, string>,
);

export function projectPresentationSurfaceIdentity(
  presentation: PublicPresentationBrandV1,
  surface: PresentationIdentitySurface,
): PresentationSurfaceIdentity {
  return Object.freeze({
    contextLabel: SURFACE_CONTEXT_LABELS[surface],
    organizationName: presentation.displayName,
    shortMark: presentation.shortMark,
  });
}

const PresentationBrandContext = createContext<
  PublicPresentationBrandV1 | null
>(null);

type PresentationBrandProviderProps = {
  children: ReactNode;
  presentation: PublicPresentationBrandV1;
};

export function PresentationBrandProvider({
  children,
  presentation,
}: PresentationBrandProviderProps) {
  const value = useMemo(() => projectPresentationBrand(presentation), [
    presentation,
  ]);

  return (
    <PresentationBrandContext.Provider value={value}>
      {children}
    </PresentationBrandContext.Provider>
  );
}

export function usePresentationBrand(): PublicPresentationBrandV1 {
  const value = useContext(PresentationBrandContext);
  if (!value) {
    throw new Error(
      "usePresentationBrand must be used within PresentationBrandProvider",
    );
  }
  return value;
}
