import type { RoutedPageProps } from "../routes/types";
import { PagePlaceholder } from "./PagePlaceholder";

export function UploadPage(props: RoutedPageProps) {
  return (
    <PagePlaceholder
      {...props}
      note="Nog geen opslag of backendkoppeling."
      text="Binnenkort upload je hier je laadpunt- en factuurinformatie."
      title="Upload"
    />
  );
}
