import type { MouseEvent } from "react";
import {
  type AuthenticatedPresentationSurface,
  projectAuthenticatedSurfaceIdentity,
  usePresentationBrand,
} from "../presentation/PresentationBrandProvider";
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
  authenticatedIdentitySurface?: AuthenticatedPresentationSurface;
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
  authenticatedIdentitySurface,
  currentPath,
  navigate,
  navigation = publicNavigation,
  surface = "public",
}: AppHeaderProps) {
  const presentation = usePresentationBrand();
  const authenticatedIdentity = authenticatedIdentitySurface
    ? projectAuthenticatedSurfaceIdentity(
      presentation,
      authenticatedIdentitySurface,
    )
    : null;
  const organizationName = authenticatedIdentity?.organizationName ??
    presentation.displayName;
  const contextLabel = authenticatedIdentity?.contextLabel ??
    presentation.tagline;
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
          aria-label={`${organizationName} home`}
          onClick={handleClick("/")}
        >
          <span className="brand-symbol" aria-hidden="true">
            {authenticatedIdentity?.shortMark ?? presentation.shortMark}
          </span>
          <span>
            <strong>{organizationName}</strong>
            {contextLabel ? <small>{contextLabel}</small> : null}
          </span>
        </a>

        {navigation.length > 0
          ? (
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
          )
          : null}
      </div>
    </header>
  );
}
