export type SelectOption = {
  value: string;
  label: string;
};

export const chargerBrands: SelectOption[] = [
  { value: "27", label: "ABB" },
  { value: "12", label: "ABL" },
  { value: "1", label: "Alfen" },
  { value: "28", label: "ALP EV" },
  { value: "44", label: "Alpitronic" },
  { value: "43", label: "Alva" },
  { value: "47", label: "Amina" },
  { value: "17", label: "Autel" },
  { value: "21", label: "Bluebuilt" },
  { value: "29", label: "BlueCurrent" },
  { value: "30", label: "Charge Amps" },
  { value: "41", label: "Chargepoint" },
  { value: "22", label: "Connectric" },
  { value: "31", label: "Cube" },
  { value: "18", label: "DIC" },
  { value: "5", label: "Easee" },
  { value: "9", label: "Ecotap" },
  { value: "23", label: "Eneco" },
  { value: "10", label: "Enovates" },
  { value: "24", label: "Enphase" },
  { value: "11", label: "Etrel" },
  { value: "2", label: "Evbox" },
  { value: "46", label: "Flexicharge" },
  { value: "34", label: "Go-e" },
  { value: "32", label: "growatt" },
  { value: "14", label: "Hager" },
  { value: "33", label: "Huawei" },
  { value: "7", label: "KEBA" },
  { value: "6", label: "Mennekes" },
  { value: "35", label: "MyEnergi" },
  { value: "45", label: "Nidec" },
  { value: "25", label: "Ohme" },
  { value: "19", label: "Peblar" },
  { value: "13", label: "Raedian" },
  { value: "36", label: "Ratio" },
  { value: "8", label: "Shell New Motion" },
  { value: "38", label: "Sigenergy" },
  { value: "16", label: "Smappee" },
  { value: "20", label: "Solaredge" },
  { value: "42", label: "Tap-Point" },
  { value: "15", label: "Tesla" },
  { value: "37", label: "Volkswagen" },
  { value: "26", label: "Volt time" },
  { value: "4", label: "Wallbox" },
  { value: "40", label: "Webasto" },
  { value: "3", label: "Zaptec" },
  { value: "39", label: "Zonneplan" },
  { value: "other", label: "Anders" },
];

export const chargerModelsByBrand: Record<string, SelectOption[]> = {
  "1": [
    { value: "2", label: "Eve Double Pro Line" },
    { value: "1", label: "Eve Single Pro Line" },
    { value: "3", label: "Eve Single S Line" },
    { value: "4", label: "Twin" },
    { value: "5", label: "Twin 5" },
    { value: "6", label: "Twin 5 plus" },
  ],
  "2": [
    { value: "7", label: "Businessline Hub" },
    { value: "8", label: "Businessline Satellite" },
    { value: "49", label: "Elvi MID" },
    { value: "85", label: "Homeline" },
  ],
  "3": [
    { value: "44", label: "Go 2" },
    { value: "9", label: "Pro" },
  ],
  "4": [
    { value: "77", label: "Cooper" },
    { value: "10", label: "Em4" },
    { value: "78", label: "Pulsar Max" },
    { value: "79", label: "Pulsar Plus" },
    { value: "80", label: "Pulsar Pro" },
  ],
  "5": [
    { value: "12", label: "Charge Max" },
    { value: "13", label: "Charge Pro" },
  ],
  "6": [
    { value: "16", label: "Amtron 4you" },
    { value: "14", label: "Amtron professional" },
    { value: "15", label: "Amtron professional twincharge" },
  ],
  "7": [
    { value: "17", label: "P30 C-series" },
    { value: "19", label: "P30 company car" },
    { value: "20", label: "P30 PV edition" },
    { value: "18", label: "P30 X-series" },
  ],
  "8": [
    { value: "105", label: "Businessline" },
    { value: "54", label: "Home advanced 2.0" },
    { value: "21", label: "Home Geavanceerd 3.0" },
    { value: "93", label: "Lolo" },
  ],
  "9": [
    { value: "23", label: "Duo Wallcharger" },
    { value: "24", label: "Duo Wide" },
    { value: "25", label: "Duo Wide AC44" },
    { value: "22", label: "Single Wallcharger" },
  ],
  "10": [
    { value: "27", label: "Business" },
    { value: "26", label: "One" },
    { value: "28", label: "Public" },
    { value: "29", label: "Truck" },
  ],
  "11": [
    { value: "30", label: "Inch Pro" },
  ],
  "12": [
    { value: "31", label: "emH3" },
  ],
  "13": [
    { value: "32", label: "Neo" },
    { value: "33", label: "Nex" },
  ],
  "14": [
    { value: "35", label: "Witty Plus" },
    { value: "34", label: "XVL122S" },
  ],
  "15": [
    { value: "36", label: "Wall Connector 3 MID" },
  ],
  "16": [
    { value: "39", label: "EV Base" },
    { value: "37", label: "EV One" },
    { value: "38", label: "EV Wall" },
  ],
  "17": [
    { value: "40", label: "AC Ultra" },
    { value: "47", label: "Maxi EU AC W22-C5- 4G-L-M" },
  ],
  "18": [
    { value: "43", label: "Basic laadzuil" },
    { value: "91", label: "BlackBoxx" },
    { value: "41", label: "Charge Easy" },
    { value: "42", label: "Laadzuil" },
  ],
  "19": [
    { value: "45", label: "Business" },
    { value: "73", label: "Home" },
    { value: "46", label: "Home Plus" },
  ],
  "20": [
    { value: "48", label: "One EV Charger Pro" },
    { value: "56", label: "se-evk22crm-01" },
  ],
  "21": [
    { value: "95", label: "11kW" },
    { value: "50", label: "22kW" },
  ],
  "22": [
    { value: "51", label: "Eneco" },
  ],
  "23": [
    { value: "52", label: "Connectric" },
  ],
  "24": [
    { value: "53", label: "EV charger 2" },
  ],
  "25": [
    { value: "55", label: "Home Pro" },
  ],
  "26": [
    { value: "57", label: "Source Pro" },
  ],
  "27": [
    { value: "107", label: "TACW22-4" },
    { value: "58", label: "Terra AC W11-G5-R-0" },
  ],
  "28": [
    { value: "59", label: "Easy Charge Oval" },
    { value: "60", label: "Easy Charge Oval Smart+" },
  ],
  "29": [
    { value: "61", label: "Nanocharge" },
    { value: "62", label: "U:Move" },
  ],
  "30": [
    { value: "63", label: "Aura" },
    { value: "110", label: "Dawn" },
    { value: "64", label: "Halo" },
    { value: "65", label: "Luna" },
  ],
  "31": [
    { value: "66", label: "Cube Smart" },
  ],
  "32": [
    { value: "67", label: "Thor -22as-p" },
  ],
  "33": [
    { value: "68", label: "Scharger-22KT-S0" },
  ],
  "34": [
    { value: "69", label: "Gemini" },
    { value: "70", label: "Gemini Flex 2.0" },
  ],
  "35": [
    { value: "71", label: "Zappi" },
  ],
  "36": [
    { value: "84", label: "IO6 Pro" },
    { value: "109", label: "IO7" },
    { value: "72", label: "Solar" },
  ],
  "37": [
    { value: "74", label: "Elli" },
    { value: "75", label: "Elli Pro" },
  ],
  "38": [
    { value: "76", label: "Sigen EVAC 11 4G T2 WH" },
  ],
  "39": [
    { value: "81", label: "Charge 2.0" },
  ],
  "40": [
    { value: "82", label: "AC22 SW 0 MID SH" },
    { value: "83", label: "Pure" },
  ],
  "41": [
    { value: "88", label: "Cobalt" },
    { value: "86", label: "Neon" },
    { value: "87", label: "Neon Premium" },
    { value: "89", label: "Platinum" },
    { value: "90", label: "Platinum Ultra" },
  ],
  "42": [
    { value: "92", label: "Pro LCD Cable" },
  ],
  "43": [
    { value: "94", label: "Max" },
  ],
  "44": [
    { value: "96", label: "HYC50" },
  ],
  "45": [
    { value: "97", label: "DPDT-360-360" },
  ],
  "46": [
    { value: "101", label: "Business Duo" },
    { value: "102", label: "Business Public" },
    { value: "100", label: "Business Solo" },
    { value: "99", label: "Business Transport" },
    { value: "103", label: "Business Wall Duo" },
    { value: "104", label: "Business Wall Solo" },
    { value: "108", label: "Home" },
    { value: "98", label: "Home met MID" },
  ],
};

export const backendSuppliers: SelectOption[] = [
  { value: "50five", label: "50five" },
  { value: "Alfen", label: "Alfen" },
  { value: "Alva Charging", label: "Alva Charging" },
  { value: "ANWB", label: "ANWB" },
  { value: "Ayvens", label: "Ayvens" },
  { value: "Blue Current", label: "Blue Current" },
  { value: "BMW", label: "BMW" },
  { value: "Charge Amps", label: "Charge Amps" },
  { value: "ChargeCars", label: "ChargeCars" },
  { value: "ChargePoint", label: "ChargePoint" },
  { value: "ConnectNed", label: "ConnectNed" },
  { value: "Cube Charging", label: "Cube Charging" },
  { value: "DIC Laadsystemen", label: "DIC Laadsystemen" },
  { value: "E-Flux (Road)", label: "E-Flux (Road)" },
  { value: "Easee", label: "Easee" },
  { value: "Ecotap", label: "Ecotap" },
  { value: "Eneco eMobility", label: "Eneco eMobility" },
  { value: "Enexis", label: "Enexis" },
  { value: "Enphase", label: "Enphase" },
  { value: "Essent", label: "Essent" },
  { value: "EV Company", label: "EV Company" },
  { value: "EVBox", label: "EVBox" },
  { value: "Greenflux", label: "Greenflux" },
  { value: "Groendus", label: "Groendus" },
  { value: "ICU Connect", label: "ICU Connect" },
  { value: "Joulz", label: "Joulz" },
  { value: "Justplugin", label: "Justplugin" },
  { value: "Laadnet", label: "Laadnet" },
  { value: "Last Mile Solutions", label: "Last Mile Solutions" },
  { value: "Mijn Reith Power", label: "Mijn Reith Power" },
  { value: "Monta", label: "Monta" },
  { value: "MyEve", label: "MyEve" },
  { value: "NewMotion / Shell Recharge", label: "NewMotion / Shell Recharge" },
  { value: "NextEnergy", label: "NextEnergy" },
  { value: "Overig", label: "Overig" },
  { value: "Peblar", label: "Peblar" },
  { value: "Plugchoice", label: "Plugchoice" },
  { value: "Plugfuse", label: "Plugfuse" },
  { value: "Ratio", label: "Ratio" },
  { value: "Reith Power", label: "Reith Power" },
  { value: "Road B.V.", label: "Road B.V." },
  { value: "Shuttel", label: "Shuttel" },
  { value: "Smappee", label: "Smappee" },
  { value: "SolarEdge", label: "SolarEdge" },
  { value: "Tesla", label: "Tesla" },
  { value: "Tibber", label: "Tibber" },
  { value: "Travelcard", label: "Travelcard" },
  { value: "Vandebron", label: "Vandebron" },
  { value: "Vattenfall InCharge", label: "Vattenfall InCharge" },
  { value: "Wallbox", label: "Wallbox" },
  { value: "Webasto", label: "Webasto" },
  { value: "Zappi", label: "Zappi" },
  { value: "Zaptec", label: "Zaptec" },
  { value: "Zonneplan", label: "Zonneplan" },
  { value: "Custom (nieuwe toevoegen)", label: "Anders" },
];

export function getBrandLabel(value: string, manualBrand = "") {
  if (value === "other" && manualBrand.trim()) return manualBrand.trim();
  return chargerBrands.find((brand) => brand.value === value)?.label || value;
}

export function getModelLabel(brandValue: string, modelValue: string, manualModel: string) {
  if (modelValue === "manual") return manualModel.trim();
  return chargerModelsByBrand[brandValue]?.find((model) => model.value === modelValue)?.label || modelValue;
}

export function getBackendSupplierLabel(value: string, manualBackendSupplier = "") {
  if (value === "Custom (nieuwe toevoegen)" && manualBackendSupplier.trim()) {
    return manualBackendSupplier.trim();
  }

  return backendSuppliers.find((supplier) => supplier.value === value)?.label || value;
}
