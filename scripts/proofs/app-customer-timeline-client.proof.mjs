#!/usr/bin/env -S deno run --allow-read --allow-env

import {
  runDashboardReadClientProof,
} from "../../app/src/features/dashboard/dashboardReadClient.proof.ts";

const edgeSource = await Deno.readTextFile(
  new URL(
    "../../supabase/functions/api-app-dashboard-get/index.ts",
    import.meta.url,
  ),
);
if (
  !edgeSource.includes(
    "Object.prototype.hasOwnProperty.call(TIMELINE_COPY, eventType)",
  ) ||
  edgeSource.includes("eventType in TIMELINE_COPY") ||
  edgeSource.includes("application_signed: {") ||
  !edgeSource.includes('title: "Dossier ontvangen"') ||
  !edgeSource.includes('title: "Aanvulling ontvangen"') ||
  !edgeSource.includes('title: "Gegevens gecontroleerd"') ||
  !edgeSource.includes(
    'text: "De aangeleverde gegevens zijn gecontroleerd."',
  )
) {
  throw new Error("customer_timeline_edge_allowlist_not_own_key");
}

const result = await runDashboardReadClientProof();
if (
  !result.ok || !result.timelineContractVerified ||
  !result.statusMappingVerified
) {
  throw new Error("customer_timeline_client_contract_failed");
}
console.log("DASHBOARD_READ_CLIENT_TIMELINE=PASS");
console.log("DASHBOARD_EDGE_TIMELINE_ALLOWLIST=PASS");
console.log("DASHBOARD_STATUS_MAPPING=PASS");
