export type DashboardView = "customer" | "enval";

export type AssetType = "private_home" | "business" | "vve" | "second_home";

export type AssetStatus =
  | "submitted"
  | "needs_customer_action"
  | "under_review"
  | "year_kwh_required"
  | "successful_value_realized";

export type DashboardCustomer = {
  name: string;
  email: string;
};

export type DashboardRequest = {
  id: string;
  assetId: string;
  title: string;
  scope: string;
  status: string;
  urgency: string;
  actionLabel: string;
};

export type DashboardDocument = {
  id: string;
  title: string;
  status: string;
};

export type DashboardCharger = {
  id: string;
  label: string;
  midNumber: string;
  status: string;
};

export type DashboardTimelineEvent = {
  id: string;
  label: string;
  date: string;
  status: string;
};

export type DashboardConsent = {
  id: string;
  title: string;
  status: string;
  version: string;
};

export type ValueYear = {
  year: string;
  mode: "handled" | "running";
  kwh: string;
  grossValue: string;
  externalCosts: string;
  envalFee: string;
  netCustomerResult: string;
  status: string;
};

export type DashboardAsset = {
  id: string;
  type: AssetType;
  typeLabel: string;
  name: string;
  identity: string;
  status: AssetStatus;
  statusLabel: string;
  locationsCount: number;
  chargersCount: number;
  openActions: number;
  nextAction: string;
  documents: DashboardDocument[];
  chargers: DashboardCharger[];
  timeline: DashboardTimelineEvent[];
  consents: DashboardConsent[];
  valueYears: ValueYear[];
};

export type DashboardMockData = {
  customer: DashboardCustomer;
  assets: DashboardAsset[];
  requests: DashboardRequest[];
};
