import { AccountPageContent } from "../features/auth/AccountPage";
import type { RoutedPageProps } from "../routes/types";
import { AppHeader } from "../shared/components/AppHeader";
import { SurfaceShell } from "../shared/components/SurfaceShell";

export function AccountPage({ currentPath, navigate }: RoutedPageProps) {
  return (
    <SurfaceShell
      navigation={
        <AppHeader
          currentPath={currentPath}
          navigate={navigate}
          surface="tenant_customer"
        />
      }
      surface="tenant_customer"
    >
      <AccountPageContent navigate={navigate} />
    </SurfaceShell>
  );
}
