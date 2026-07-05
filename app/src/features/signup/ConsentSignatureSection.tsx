export function ConsentSignatureSection() {
  return (
    <section className="signup-section" aria-labelledby="consent-signature-title">
      <div className="signup-section-header">
        <p className="eyebrow">Stap 4</p>
        <h2 id="consent-signature-title">Toestemming en handtekening</h2>
      </div>

      <div className="consent-signature-grid">
        <div className="consent-note">
          <h3>Toestemming</h3>
          <p>Definitieve toestemmingstekst volgt voor productie.</p>
        </div>

        <div className="signature-placeholder">
          <h3>Handtekening</h3>
          <div className="signature-box" aria-hidden="true" />
          <p>Handtekening wordt later technisch uitgewerkt.</p>
        </div>
      </div>
    </section>
  );
}
