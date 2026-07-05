import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function NotFoundPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      actionHref="/"
      actionLabel="Terug naar home"
      text="Deze pagina bestaat nog niet in de nieuwe ENVAL app."
      title="Pagina niet gevonden"
    />
  );
}
