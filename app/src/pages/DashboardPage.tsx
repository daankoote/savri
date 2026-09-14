import { DashboardPageShell } from "../features/dashboard/DashboardPageShell";
import { DashboardRouteGuard } from "../features/auth/DashboardRouteGuard";
import type { RoutedPageProps } from "../routes/types";

export function DashboardPage({ currentPath, navigate }: RoutedPageProps) {
  return (
    <DashboardRouteGuard navigate={navigate} returnTo={currentPath}>
      <DashboardPageShell currentPath={currentPath} navigate={navigate} />
    </DashboardRouteGuard>
  );
}
