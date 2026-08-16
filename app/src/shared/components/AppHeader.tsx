import type { MouseEvent } from "react";
import { usePresentationBrand } from "../presentation/PresentationBrandProvider";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Opbrengst", href: "/#opbrengst" },
  { label: "Aanmerking", href: "/#aanmerking" },
  { label: "Aanmelden", href: "/aanmelden" },
  { label: "ERE info", href: "/ere" },
  { label: "Contact", href: "/contact" },
  { label: "Inloggen", href: "/account" },
];

type AppHeaderProps = {
  currentPath: string;
  navigate: (href: string) => void;
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

export function AppHeader({ currentPath, navigate }: AppHeaderProps) {
  const presentation = usePresentationBrand();
  const handleClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(href);
  };

  return (
    <header className="app-header">
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
          {navItems.map((item) => (
            <a
              aria-current={isActiveNavItem(item.href, currentPath) ? "page" : undefined}
              href={item.href}
              key={item.label}
              onClick={handleClick(item.href)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
