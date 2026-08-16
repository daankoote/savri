import { createContext, type ReactNode, useContext, useMemo } from "react";
import { ENVAL_PRESENTATION_BRAND_CONFIG_V1 } from "../../../../platform/runtime/presentation/enval_presentation_defaults.ts";
import {
  projectPresentationBrand,
  type PublicPresentationBrandV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";

const ENVAL_PUBLIC_PRESENTATION = projectPresentationBrand(
  ENVAL_PRESENTATION_BRAND_CONFIG_V1,
);
const PresentationBrandContext = createContext<
  PublicPresentationBrandV1 | null
>(null);

type PresentationBrandProviderProps = {
  children: ReactNode;
  presentation?: PublicPresentationBrandV1;
};

export function PresentationBrandProvider({
  children,
  presentation,
}: PresentationBrandProviderProps) {
  const value = useMemo(
    () =>
      presentation
        ? projectPresentationBrand(presentation)
        : ENVAL_PUBLIC_PRESENTATION,
    [presentation],
  );

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
