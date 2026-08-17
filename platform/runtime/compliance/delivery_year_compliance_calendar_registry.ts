import {
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  type DeliveryYearComplianceCalendarV1,
} from "./delivery_year_compliance.ts";

export const SUPPORTED_DELIVERY_YEARS = Object.freeze([2026] as const);

export type DeliveryYearComplianceCalendarResolution =
  | Readonly<{ ok: true; value: DeliveryYearComplianceCalendarV1 }>
  | Readonly<{ ok: false; code: "unsupported_delivery_year" }>;

export function resolveDeliveryYearComplianceCalendar(
  deliveryYear: number,
): DeliveryYearComplianceCalendarResolution {
  return deliveryYear === 2026
    ? { ok: true, value: DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1 }
    : { ok: false, code: "unsupported_delivery_year" };
}
