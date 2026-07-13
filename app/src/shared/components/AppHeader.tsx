import type { MouseEvent } from "react";

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
  const handleClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(href);
  };

  return (
    <header className="app-header">
      <div className="container header-inner">
        <a className="brand-mark" href="/" aria-label="ENVAL home" onClick={handleClick("/")}>
          <span className="brand-symbol" aria-hidden="true">E</span>
          <span>
            <strong>ENVAL</strong>
            <small>ERE inboekservice</small>
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
