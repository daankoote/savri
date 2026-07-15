export type DashboardAccountType = "particulier" | "zakelijk" | "vve";

export type DashboardDossierSummary = {
  dossier_id: string;
  dossier_number: string | null;
  account_type: DashboardAccountType;
  status: string;
  document_changes_allowed: boolean;
};

export type DashboardLocation = {
  location_id: string;
  label: string | null;
  status: string;
  address: {
    postcode: string;
    house_number: string;
    suffix: string | null;
    street: string | null;
    city: string | null;
    country: string;
  };
};

export type DashboardCharger = {
  charger_id: string;
  location_id: string;
  status: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  mid_number: string;
  mid_status: string;
  installation_year: number | null;
  backend_supplier: string | null;
  solar_export_status: string | null;
};

export type DashboardDocumentSlot = {
  document_slot_id: string;
  location_id: string | null;
  charger_id: string | null;
  document_type: string;
  required: boolean;
  title: string;
  status: string;
  current_version_number: number | null;
  current_file_name: string | null;
};

export type DashboardLegalAcceptance = {
  acceptance_type: string;
  version: string;
  status: string;
  accepted_at: string | null;
  active: boolean;
};

export type DashboardReadModel = {
  request_id: string;
  dossiers: DashboardDossierSummary[];
  selected_dossier: DashboardDossierSummary;
  locations: DashboardLocation[];
  chargers: DashboardCharger[];
  document_slots: DashboardDocumentSlot[];
  legal_acceptances: DashboardLegalAcceptance[];
};
