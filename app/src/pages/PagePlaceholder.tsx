import type { MouseEvent } from "react";
import type { RoutedPageProps } from "../routes/types";
import { AppHeader } from "../shared/components/AppHeader";

type PagePlaceholderProps = RoutedPageProps & {
  actionHref?: string;
  actionLabel?: string;
  note?: string;
  title: string;
  text: string;
};

export function PagePlaceholder({
  actionHref,
  actionLabel,
  currentPath,
  navigate,
  note,
  text,
  title,
}: PagePlaceholderProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!actionHref) return;

    event.preventDefault();
    navigate(actionHref);
  };

  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <main className="page-shell">
        <section className="section">
          <div className="container page-intro">
            <h1>{title}</h1>
            <p>{text}</p>
            {actionHref && actionLabel ? (
              <a className="button button-primary" href={actionHref} onClick={handleClick}>
                {actionLabel}
              </a>
            ) : null}
            {note ? <p className="page-note">{note}</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
