import type { AddressDraft } from "./signupTypes";

type AddressFieldsProps = {
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
};

export function AddressFields({ value, onChange }: AddressFieldsProps) {
  const update = (field: keyof AddressDraft, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };

  return (
    <>
      <div className="form-grid form-grid-three">
        <label className="field">
          <span>Postcode</span>
          <input
            autoComplete="postal-code"
            onChange={(event) => update("postcode", event.target.value)}
            type="text"
            value={value.postcode}
          />
        </label>

        <label className="field">
          <span>Huisnummer</span>
          <input
            autoComplete="address-line2"
            onChange={(event) => update("houseNumber", event.target.value)}
            type="text"
            value={value.houseNumber}
          />
        </label>

        <label className="field">
          <span>Suffix (indien van toepassing)</span>
          <input
            autoComplete="address-line3"
            onChange={(event) => update("suffix", event.target.value)}
            type="text"
            value={value.suffix}
          />
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
    </>
  );
}
