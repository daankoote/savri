import type { MouseEvent } from "react";
import { usePresentationBrand } from "../presentation/PresentationBrandProvider";
import type {
  AppSurface,
  SurfaceNavigationItem,
} from "../surfaces/surfaceModel";

const publicNavigation = [
  { label: "Home", href: "/" },
  { label: "Opbrengst", href: "/#opbrengst" },
  { label: "Aanmerking", href: "/#aanmerking" },
  { label: "Aanmelden", href: "/aanmelden" },
  { label: "ERE info", href: "/ere" },
  { label: "Contact", href: "/contact" },
  { label: "Inloggen", href: "/account" },
] satisfies readonly SurfaceNavigationItem[];

type AppHeaderProps = {
  currentPath: string;
  navigate: (href: string) => void;
  navigation?: readonly SurfaceNavigationItem[];
  surface?: AppSurface;
};

function getPathname(href: string) {
  return new URL(href, window.location.origin).pathname;
}

function isActiveNavItem(href: string, currentPath: string) {
  if (href.includes("#")) {
    return false;
  }

  return getPathname(href) === currentPath;
}

export function AppHeader({
  currentPath,
  navigate,
  navigation = publicNavigation,
  surface = "public",
}: AppHeaderProps) {
  const presentation = usePresentationBrand();
  const handleClick =
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigate(href);
    };

  return (
    <header className="app-header" data-app-surface-navigation={surface}>
      <div className="container header-inner">
        <a
          className="brand-mark"
          href="/"
          aria-label={`${presentation.displayName} home`}
          onClick={handleClick("/")}
        >
          <span className="brand-symbol" aria-hidden="true">
            {presentation.shortMark}
          </span>
          <span>
            <strong>{presentation.displayName}</strong>
            {presentation.tagline
              ? <small>{presentation.tagline}</small>
              : null}
          </span>
        </a>

        <nav className="header-nav" aria-label="Hoofdnavigatie">
          {navigation.flatMap((item) =>
            item.href
              ? [
                (
                  <a
                    aria-current={(item.active ??
                        isActiveNavItem(item.href, currentPath))
                      ? "page"
                      : undefined}
                    href={item.href}
                    key={item.label}
                    onClick={handleClick(item.href)}
                  >
                    {item.label}
                  </a>
                ),
              ]
              : []
          )}
        </nav>
      </div>
    </header>
  );
}
