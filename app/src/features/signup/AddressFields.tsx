import type { AddressLookupResult } from "./address/addressLookup";
import {
  cleanHouseNumberInput,
  cleanPostcodeInput,
  cleanSuffixInput,
  createAddressLookupKey,
  normalizeAddressLookupInput,
  normalizeHouseNumber,
  normalizePostcode,
  normalizeSuffix,
} from "./address/addressNormalizers";
import { useAddressLookup } from "./address/useAddressLookup";
import type { AddressDraft, SignupFieldErrors } from "./signupTypes";
import { firstSignupFieldError, signupFieldErrorId } from "./signupValidation";
import { formatStructuredDutchAddress } from "./structuredAddress";

type AddressFieldsProps = {
  fieldErrors: SignupFieldErrors;
  locationId: string;
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
  compact?: boolean;
};

export function AddressFields({
  fieldErrors,
  locationId,
  value,
  onChange,
  compact = false,
}: AddressFieldsProps) {
  const updateLookupInput = (
    field: "postcode" | "houseNumber" | "suffix",
    nextValue: string,
  ) => {
    const nextAddress = { ...value, [field]: nextValue };
    const nextLookupKey = createAddressLookupKey(
      normalizeAddressLookupInput(nextAddress),
    );
    const shouldKeepResolvedAddress = Boolean(
      value.resolvedLookupKey && value.resolvedLookupKey === nextLookupKey,
    );

    onChange({
      ...nextAddress,
      street: shouldKeepResolvedAddress ? value.street : "",
      city: shouldKeepResolvedAddress ? value.city : "",
      country: shouldKeepResolvedAddress ? value.country : "Nederland",
      bagId: shouldKeepResolvedAddress ? value.bagId : null,
      resolvedLookupKey: shouldKeepResolvedAddress
        ? value.resolvedLookupKey
        : null,
    });
  };

  const resolvedLookupKey = (result: AddressLookupResult) =>
    createAddressLookupKey(result.normalized);

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

  const fieldPrefix = `locations.${locationId}`;
  const postcodeError = firstSignupFieldError(
    fieldErrors,
    `${fieldPrefix}.postalCode`,
  );
  const houseNumberError = firstSignupFieldError(
    fieldErrors,
    `${fieldPrefix}.houseNumber`,
  );
  const suffixError = firstSignupFieldError(
    fieldErrors,
    `${fieldPrefix}.suffix`,
  );

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
      <div
        className={`form-grid form-grid-three${
          compact ? " address-fields-compact" : ""
        }`}
      >
        <label className="field">
          <span>Postcode</span>
          <input
            aria-describedby={postcodeError
              ? signupFieldErrorId(postcodeError.fieldPath)
              : undefined}
            aria-invalid={postcodeError ? true : undefined}
            autoComplete="postal-code"
            onBlur={(event) =>
              updateLookupInput(
                "postcode",
                normalizePostcode(event.target.value),
              )}
            onChange={(event) =>
              updateLookupInput(
                "postcode",
                cleanPostcodeInput(event.target.value),
              )}
            placeholder="1234AB"
            type="text"
            value={value.postcode}
          />
          {postcodeError
            ? (
              <small
                className="field-message"
                id={signupFieldErrorId(postcodeError.fieldPath)}
                role="alert"
              >
                {postcodeError.message}
              </small>
            )
            : null}
        </label>

        <label className="field">
          <span>Huisnummer</span>
          <input
            aria-describedby={houseNumberError
              ? signupFieldErrorId(houseNumberError.fieldPath)
              : undefined}
            aria-invalid={houseNumberError ? true : undefined}
            autoComplete="address-line2"
            onBlur={(event) =>
              updateLookupInput(
                "houseNumber",
                normalizeHouseNumber(event.target.value),
              )}
            onChange={(event) =>
              updateLookupInput(
                "houseNumber",
                cleanHouseNumberInput(event.target.value),
              )}
            inputMode="numeric"
            type="text"
            value={value.houseNumber}
          />
          {houseNumberError
            ? (
              <small
                className="field-message"
                id={signupFieldErrorId(houseNumberError.fieldPath)}
                role="alert"
              >
                {houseNumberError.message}
              </small>
            )
            : null}
        </label>

        <label className="field">
          <span>Toevoeging (optioneel)</span>
          <input
            aria-describedby={suffixError
              ? signupFieldErrorId(suffixError.fieldPath)
              : undefined}
            aria-invalid={suffixError ? true : undefined}
            autoComplete="address-line3"
            onBlur={(event) =>
              updateLookupInput("suffix", normalizeSuffix(event.target.value))}
            onChange={(event) =>
              updateLookupInput("suffix", cleanSuffixInput(event.target.value))}
            type="text"
            value={value.suffix}
          />
          {suffixError
            ? (
              <small
                className="field-message"
                id={signupFieldErrorId(suffixError.fieldPath)}
                role="alert"
              >
                {suffixError.message}
              </small>
            )
            : null}
        </label>
      </div>

      {compact
        ? (
          <p className="address-fields-compact__preview">
            {formatStructuredDutchAddress({
              street: value.street,
              houseNumber: value.houseNumber,
              houseNumberAddition: value.suffix,
              postalCode: value.postcode,
              city: value.city,
              country: value.country,
            }) || "Het volledige adres verschijnt hier na de adreslookup."}
          </p>
        )
        : (
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
        )}

      {lookup.message
        ? (
          <p
            className={`address-lookup-status address-lookup-status-${lookup.status}`}
            aria-live="polite"
          >
            {lookup.message}
          </p>
        )
        : null}
    </>
  );
}
