import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  projectPresentationBrand,
  type PublicPresentationBrandV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";

export type AuthenticatedPresentationSurface =
  | "tenant_customer"
  | "tenant_operator";

export type AuthenticatedSurfaceIdentity = Readonly<{
  contextLabel: "Klantportaal" | "Dossierbeheer";
  organizationName: string;
  shortMark: string;
}>;

const AUTHENTICATED_CONTEXT_LABELS = Object.freeze(
  {
    tenant_customer: "Klantportaal",
    tenant_operator: "Dossierbeheer",
  } as const satisfies Record<AuthenticatedPresentationSurface, string>,
);

export function projectAuthenticatedSurfaceIdentity(
  presentation: PublicPresentationBrandV1,
  surface: AuthenticatedPresentationSurface,
): AuthenticatedSurfaceIdentity {
  return Object.freeze({
    contextLabel: AUTHENTICATED_CONTEXT_LABELS[surface],
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
