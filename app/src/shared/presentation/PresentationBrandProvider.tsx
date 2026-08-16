import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  projectPresentationBrand,
  type PublicPresentationBrandV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";

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
