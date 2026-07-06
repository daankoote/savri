import type { AddressLookupResult } from "./address/addressLookup";
import {
  cleanHouseNumberInput,
  cleanPostcodeInput,
  cleanSuffixInput,
  createAddressLookupKey,
  getHouseNumberValidationMessage,
  getPostcodeValidationMessage,
  getSuffixValidationMessage,
  normalizeAddressLookupInput,
  normalizeHouseNumber,
  normalizePostcode,
  normalizeSuffix,
} from "./address/addressNormalizers";
import { useAddressLookup } from "./address/useAddressLookup";
import type { AddressDraft } from "./signupTypes";

type AddressFieldsProps = {
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
};

export function AddressFields({ value, onChange }: AddressFieldsProps) {
  const updateLookupInput = (field: "postcode" | "houseNumber" | "suffix", nextValue: string) => {
    const nextAddress = { ...value, [field]: nextValue };
    const nextLookupKey = createAddressLookupKey(normalizeAddressLookupInput(nextAddress));
    const shouldKeepResolvedAddress = Boolean(value.resolvedLookupKey && value.resolvedLookupKey === nextLookupKey);

    onChange({
      ...nextAddress,
      street: shouldKeepResolvedAddress ? value.street : "",
      city: shouldKeepResolvedAddress ? value.city : "",
      country: shouldKeepResolvedAddress ? value.country : "Nederland",
      bagId: shouldKeepResolvedAddress ? value.bagId : null,
      resolvedLookupKey: shouldKeepResolvedAddress ? value.resolvedLookupKey : null,
    });
  };

  const resolvedLookupKey = (result: AddressLookupResult) => createAddressLookupKey(result.normalized);

  const applyLookupResult = (result: AddressLookupResult) => {
    onChange({
      ...value,
      postcode: result.normalized.postcode,
      houseNumber: result.normalized.houseNumber,
      suffix: result.normalized.suffix,
      street: result.street,
      city: result.city,
      country: result.country,
      bagId: result.bagId,
      resolvedLookupKey: resolvedLookupKey(result),
    });
  };

  const postcodeMessage = getPostcodeValidationMessage(value.postcode);
  const houseNumberMessage = getHouseNumberValidationMessage(value.houseNumber);
  const suffixMessage = getSuffixValidationMessage(value.suffix);

  const lookup = useAddressLookup(
    {
      postcode: value.postcode,
      houseNumber: value.houseNumber,
      suffix: value.suffix,
    },
    { onResolved: applyLookupResult },
  );

  return (
    <>
      <div className="form-grid form-grid-three">
        <label className="field">
          <span>Postcode</span>
          <input
            autoComplete="postal-code"
            onBlur={(event) => updateLookupInput("postcode", normalizePostcode(event.target.value))}
            onChange={(event) => updateLookupInput("postcode", cleanPostcodeInput(event.target.value))}
            placeholder="1234AB"
            type="text"
            value={value.postcode}
          />
          {postcodeMessage ? <small className="field-message">{postcodeMessage}</small> : null}
        </label>

        <label className="field">
          <span>Huisnummer</span>
          <input
            autoComplete="address-line2"
            onBlur={(event) => updateLookupInput("houseNumber", normalizeHouseNumber(event.target.value))}
            onChange={(event) => updateLookupInput("houseNumber", cleanHouseNumberInput(event.target.value))}
            inputMode="numeric"
            type="text"
            value={value.houseNumber}
          />
          {houseNumberMessage ? <small className="field-message">{houseNumberMessage}</small> : null}
        </label>

        <label className="field">
          <span>Suffix (indien van toepassing)</span>
          <input
            autoComplete="address-line3"
            onBlur={(event) => updateLookupInput("suffix", normalizeSuffix(event.target.value))}
            onChange={(event) => updateLookupInput("suffix", cleanSuffixInput(event.target.value))}
            type="text"
            value={value.suffix}
          />
          {suffixMessage ? <small className="field-message">{suffixMessage}</small> : null}
        </label>
      </div>

      <div className="form-grid form-grid-three">
        <label className="field">
          <span>Adres</span>
          <input
            autoComplete="address-line1"
            className="input-readonly"
            placeholder="Wordt automatisch ingevuld"
            readOnly
            type="text"
            value={value.street}
          />
        </label>

        <label className="field">
          <span>Stad</span>
          <input
            autoComplete="address-level2"
            className="input-readonly"
            placeholder="Wordt automatisch ingevuld"
            readOnly
            type="text"
            value={value.city}
          />
        </label>

        <label className="field">
          <span>Land</span>
          <input
            autoComplete="country-name"
            className="input-readonly"
            placeholder="Nederland"
            readOnly
            type="text"
            value={value.country}
          />
        </label>
      </div>

      {lookup.message ? (
        <p className={`address-lookup-status address-lookup-status-${lookup.status}`} aria-live="polite">
          {lookup.message}
        </p>
      ) : null}
    </>
  );
}
