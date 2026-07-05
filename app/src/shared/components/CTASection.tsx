import type { MouseEvent } from "react";

type CTASectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  navigate?: (href: string) => void;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
};

export function CTASection({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
  navigate,
  secondaryActionLabel,
  secondaryActionHref,
}: CTASectionProps) {
  const handleClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!navigate || !href.startsWith("/")) return;

    event.preventDefault();
    navigate(href);
  };

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
            <a className="button button-primary" href={actionHref} onClick={handleClick(actionHref)}>
              {actionLabel}
            </a>
            {secondaryActionLabel && secondaryActionHref ? (
              <a
                className="button button-secondary"
                href={secondaryActionHref}
                onClick={handleClick(secondaryActionHref)}
              >
                {secondaryActionLabel}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
