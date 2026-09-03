export const APP_SURFACES = Object.freeze(
  [
    "public",
    "tenant_public",
    "tenant_customer",
    "tenant_operator",
    "enval_control",
    "verifier",
  ] as const,
);

export type AppSurface = (typeof APP_SURFACES)[number];

export type SurfaceNavigationItem = Readonly<{
  active?: boolean;
  href?: string;
  label: string;
  onSelect?: () => void;
}>;
