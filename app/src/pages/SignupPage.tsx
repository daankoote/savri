import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function SignupPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      actionHref="/upload"
      actionLabel="Naar upload"
      text="Binnenkort meld je je hier direct aan bij ENVAL."
      title="Aanmelden"
    />
  );
}
