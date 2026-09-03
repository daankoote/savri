import { DashboardPageShell } from "../features/dashboard/DashboardPageShell";
import { DashboardRouteGuard } from "../features/auth/DashboardRouteGuard";
import type { RoutedPageProps } from "../routes/types";

export function DashboardPage({ navigate }: RoutedPageProps) {
  return (
    <DashboardRouteGuard navigate={navigate}>
      <DashboardPageShell navigate={navigate} />
    </DashboardRouteGuard>
  );
}
