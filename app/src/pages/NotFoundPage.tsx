import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";
import { usePresentationBrand } from "../shared/presentation/PresentationBrandProvider";

export function NotFoundPage(props: RoutedPageProps) {
  const presentation = usePresentationBrand();
  return (
    <PagePlaceholder
      {...props}
      actionHref="/"
      actionLabel="Terug naar home"
      text={`Deze pagina bestaat nog niet in de nieuwe ${presentation.displayName} app.`}
      title="Pagina niet gevonden"
    />
  );
}
