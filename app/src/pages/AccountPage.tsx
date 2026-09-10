import { AccountPageContent } from "../features/auth/AccountPage";
import { useAuth } from "../features/auth/AuthProvider";
import type { RoutedPageProps } from "../routes/types";
import { AppHeader } from "../shared/components/AppHeader";
import { SurfaceShell } from "../shared/components/SurfaceShell";

export function AccountPage({ currentPath, navigate }: RoutedPageProps) {
  const auth = useAuth();
  const surface = auth.audience === "operator"
    ? "tenant_operator"
    : "tenant_customer";

  return (
    <SurfaceShell
      navigation={
        <AppHeader
          currentPath={currentPath}
          navigate={navigate}
          navigation={[]}
          surface={surface}
        />
      }
      surface={surface}
    >
      <AccountPageContent currentPath={currentPath} navigate={navigate} />
    </SurfaceShell>
  );
}
