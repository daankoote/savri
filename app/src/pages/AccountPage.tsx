import { AccountPageContent } from "../features/auth/AccountPage";
import type { RoutedPageProps } from "../routes/types";
import { AppHeader } from "../shared/components/AppHeader";

export function AccountPage({ currentPath, navigate }: RoutedPageProps) {
  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <AccountPageContent navigate={navigate} />
    </div>
  );
}
