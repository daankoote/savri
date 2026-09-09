import type { SurfaceNavigationItem } from "../../shared/surfaces/surfaceModel.ts";
import type { OperatorContext } from "./operatorContextClient.ts";

export function buildOperatorNavigation(
  context: OperatorContext,
  currentPath: string,
): readonly SurfaceNavigationItem[] {
  const items: SurfaceNavigationItem[] = [];
  if (
    context.effectiveCapabilities.includes("evidence.review.view")
  ) {
    items.push({
      label: "Overzicht",
      href: "/beheer",
      active: currentPath === "/beheer" || currentPath === "/intern/compliance",
    });
  }
  if (context.effectiveCapabilities.includes("evidence.review.view")) {
    items.push({
      label: "Dossiers",
      href: "/beheer/dossiers",
      active: currentPath === "/beheer/dossiers" ||
        currentPath.startsWith("/beheer/dossiers/") ||
        currentPath === "/intern/dossiers" ||
        currentPath.startsWith("/intern/dossiers/"),
    });
  }
  return Object.freeze(items);
}
