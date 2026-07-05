import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function TermsPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      note="Definitieve voorwaarden volgen voor productie."
      text="Voorwaarden voor aanmelding, resultaat en fee."
      title="Voorwaarden"
    />
  );
}
