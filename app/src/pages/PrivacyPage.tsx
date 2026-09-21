import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";
import { usePresentationBrand } from "../shared/presentation/PresentationBrandProvider";

export function PrivacyPage(props: RoutedPageProps) {
  const presentation = usePresentationBrand();
  return (
    <PagePlaceholder
      {...props}
      note="Definitieve privacytekst volgt voor productie."
      text={`Privacyinformatie voor de ${presentation.displayName} inboekservice.`}
      title="Privacy"
    />
  );
}
