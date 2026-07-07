export function ContactChoicePanel() {
  return (
    <div className="portal-content-stack">
      <header className="portal-content-header">
        <div>
          <h1>Contact ENVAL</h1>
          <p>Kies hoe u contact wilt opnemen.</p>
        </div>
      </header>

      <section className="portal-contact-grid" aria-label="Contactkeuzes">
        <article className="portal-card-compact">
          <h2>AI bot</h2>
          <p>Mock placeholder. Nog geen bot of backend.</p>
          <button className="button button-secondary" type="button">Start chat</button>
        </article>
        <article className="portal-card-compact">
          <h2>Bericht sturen</h2>
          <p>Mock placeholder. Nog geen berichtverzending.</p>
          <button className="button button-secondary" type="button">Bericht maken</button>
        </article>
      </section>
    </div>
  );
}
