import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function ContactPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      note="Contactgegevens worden later definitief gemaakt."
      text="Voor vragen over je situatie, documenten of aanmelding."
      title="Contact"
    />
  );
}
