import { type MouseEvent, useRef, useState } from "react";
import {
  type PresentationIdentitySurface,
  projectPresentationSurfaceIdentity,
  usePresentationBrand,
} from "../presentation/PresentationBrandProvider";
import type {
  AppSurface,
  SurfaceNavigationItem,
} from "../surfaces/surfaceModel";

function publicNavigation(
  contactRoute: string,
): readonly SurfaceNavigationItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Opbrengst", href: "/#opbrengst" },
    { label: "Aanmerking", href: "/#aanmerking" },
    { label: "Aanmelden", href: "/aanmelden" },
    { label: "ERE info", href: "/ere" },
    { label: "Contact", href: contactRoute },
    { label: "Inloggen", href: "/inloggen" },
  ];
}

type AppHeaderProps = {
  currentPath: string;
  identitySurface?: PresentationIdentitySurface;
  navigate: (href: string) => void;
  navigation?: readonly SurfaceNavigationItem[];
  onLogout?: () => Promise<boolean>;
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
  identitySurface,
  navigate,
  navigation,
  onLogout,
  surface = "public",
}: AppHeaderProps) {
  const logoutRunningRef = useRef(false);
  const [logoutRunning, setLogoutRunning] = useState(false);
  const presentation = usePresentationBrand();
  const effectiveNavigation = navigation ??
    publicNavigation(presentation.identity.contactRoute);
  const identity = identitySurface
    ? projectPresentationSurfaceIdentity(
      presentation,
      identitySurface,
    )
    : null;
  const organizationName = identity?.organizationName ??
    presentation.displayName;
  const contextLabel = identity?.contextLabel ??
    presentation.tagline;
  const handleClick =
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigate(href);
    };
  const handleLogout = async () => {
    if (!onLogout || logoutRunningRef.current) return;
    logoutRunningRef.current = true;
    setLogoutRunning(true);
    const signedOut = await onLogout().catch(() => false);
    if (signedOut) return;
    logoutRunningRef.current = false;
    setLogoutRunning(false);
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
            {identity?.shortMark ?? presentation.shortMark}
          </span>
          <span>
            <strong>{organizationName}</strong>
            {contextLabel ? <small>{contextLabel}</small> : null}
          </span>
        </a>

        {effectiveNavigation.length > 0 || onLogout
          ? (
            <nav className="header-nav" aria-label="Hoofdnavigatie">
              {effectiveNavigation.map((item) =>
                item.href
                  ? (
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
                  )
                  : item.onSelect
                  ? (
                    <button
                      key={item.label}
                      onClick={item.onSelect}
                      type="button"
                    >
                      {item.label}
                    </button>
                  )
                  : null
              )}
              {onLogout
                ? (
                  <button
                    aria-busy={logoutRunning}
                    disabled={logoutRunning}
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    Uitloggen
                  </button>
                )
                : null}
            </nav>
          )
          : null}
      </div>
    </header>
  );
}
