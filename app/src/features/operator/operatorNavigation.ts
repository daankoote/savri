import type { SurfaceNavigationItem } from "../../shared/surfaces/surfaceModel.ts";
import type { OperatorContext } from "./operatorContextClient.ts";

export function buildOperatorNavigation(
  context: OperatorContext,
): readonly SurfaceNavigationItem[] {
  const items: SurfaceNavigationItem[] = [];
  if (
    context.effectiveCapabilities.includes("compliance.delivery_year.view")
  ) {
    items.push({ label: "Overzicht", href: "/beheer" });
  }
  if (context.effectiveCapabilities.includes("evidence.review.view")) {
    items.push({ label: "Dossiers", href: "/beheer/dossiers" });
  }
  return Object.freeze(items);
}
