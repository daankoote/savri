export function HeroSection() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="container hero-minimal">
        <div className="hero-copy">
          <h1 id="hero-title">Verdien geld met je laadpaal</h1>
          <p className="hero-fee">slechts 10% fee en enkel bij resultaat</p>
          <div className="hero-actions" aria-label="Start acties">
            <a className="button button-primary" href="#opbrengst">Bereken opbrengst</a>
            <a className="button button-secondary" href="#werkwijze">Check geschiktheid</a>
            <a className="button button-secondary" href="#aanmelden">Aanmelden</a>
          </div>
        </div>
      </div>
    </section>
  );
}
