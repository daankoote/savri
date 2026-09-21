import type { ElementType, ReactNode } from "react";
import { usePresentationBrand } from "../presentation/PresentationBrandProvider";
import type { AppSurface } from "../surfaces/surfaceModel";

type SurfaceShellProps = Readonly<{
  as?: "div" | "main";
  children: ReactNode;
  className?: string;
  navigation?: ReactNode;
  platformAttribution?: boolean;
  surface: AppSurface;
}>;

export function SurfaceShell({
  as = "div",
  children,
  className = "site-frame",
  navigation,
  platformAttribution = false,
  surface,
}: SurfaceShellProps) {
  const Root = as as ElementType;
  const presentation = usePresentationBrand();

  return (
    <Root className={className} data-app-surface={surface}>
      {navigation}
      {children}
      {platformAttribution
        ? (
          <footer className="surface-attribution">
            Powered by {presentation.displayName}
          </footer>
        )
        : null}
    </Root>
  );
}
