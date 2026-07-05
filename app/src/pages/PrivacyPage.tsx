import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function PrivacyPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      note="Definitieve privacytekst volgt voor productie."
      text="Privacyinformatie voor de ENVAL inboekservice."
      title="Privacy"
    />
  );
}
