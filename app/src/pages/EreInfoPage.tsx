import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function EreInfoPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      actionHref="/#aanmerking"
      actionLabel="Check mijn situatie"
      text="Korte uitleg over ERE voor thuisladen."
      title="ERE info"
    />
  );
}
