type CTASectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
};

export function CTASection({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
  secondaryActionLabel,
  secondaryActionHref,
}: CTASectionProps) {
  return (
    <section className="section section-compact" id="aanmelden" aria-labelledby="final-cta-title">
      <div className="container">
        <div className="cta-panel">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="final-cta-title">{title}</h2>
            <p>{description}</p>
          </div>
          <div className="cta-actions">
            <a className="button button-primary" href={actionHref}>
              {actionLabel}
            </a>
            {secondaryActionLabel && secondaryActionHref ? (
              <a className="button button-secondary" href={secondaryActionHref}>
                {secondaryActionLabel}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
