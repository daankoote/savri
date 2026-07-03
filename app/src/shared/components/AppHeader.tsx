const navItems = [
  { label: "Opbrengst", href: "#opbrengst" },
  { label: "Werkwijze", href: "#werkwijze" },
  { label: "Waarom ENVAL", href: "#waarom" },
  { label: "FAQ", href: "#faq" },
];

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="container header-inner">
        <a className="brand-mark" href="#" aria-label="ENVAL home">
          <span className="brand-symbol" aria-hidden="true">E</span>
          <span>
            <strong>ENVAL</strong>
            <small>ERE inboekservice</small>
          </span>
        </a>

        <nav className="header-nav" aria-label="Hoofdnavigatie">
          {navItems.map((item) => (
            <a href={item.href} key={item.label}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
