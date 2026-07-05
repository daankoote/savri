import type { MouseEvent } from "react";

type HeroSectionProps = {
  navigate?: (href: string) => void;
};

export function HeroSection({ navigate }: HeroSectionProps) {
  const handleClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!navigate) return;

    event.preventDefault();
    navigate(href);
  };

  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="container hero-minimal">
        <div className="hero-copy">
          <h1 id="hero-title">Verdien geld met je laadpaal</h1>
          <p className="hero-fee">slechts 10% fee en enkel bij resultaat</p>
          <div className="hero-actions" aria-label="Start acties">
            <a className="button button-primary" href="/#opbrengst" onClick={handleClick("/#opbrengst")}>Bereken opbrengst</a>
            <a className="button button-secondary" href="/#aanmerking" onClick={handleClick("/#aanmerking")}>Check mijn situatie</a>
            <a className="button button-secondary" href="/aanmelden" onClick={handleClick("/aanmelden")}>Aanmelden</a>
          </div>
        </div>
      </div>
    </section>
  );
}
