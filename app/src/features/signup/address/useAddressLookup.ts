import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAddressLookupKey,
  isLookupReady,
  normalizeAddressLookupInput,
} from "./addressNormalizers";
import {
  AddressLookupError,
  type AddressLookupInput,
  type AddressLookupResult,
  verifyAddress,
} from "./addressLookup";

export type AddressLookupStatus = "idle" | "checking" | "success" | "error" | "unavailable";

export type UseAddressLookupOptions = {
  debounceMs?: number;
  onResolved: (result: AddressLookupResult) => void;
};

export function useAddressLookup(input: AddressLookupInput, options: UseAddressLookupOptions) {
  const [status, setStatus] = useState<AddressLookupStatus>("idle");
  const [message, setMessage] = useState("");
  const requestSeq = useRef(0);
  const onResolvedRef = useRef(options.onResolved);
  const debounceMs = options.debounceMs ?? 450;

  useEffect(() => {
    onResolvedRef.current = options.onResolved;
  }, [options.onResolved]);

  const normalizedInput = useMemo(() => normalizeAddressLookupInput(input), [
    input.houseNumber,
    input.postcode,
    input.suffix,
  ]);

  const lookupKey = useMemo(() => createAddressLookupKey(normalizedInput), [normalizedInput]);

  const clear = useCallback(() => {
    requestSeq.current += 1;
    setStatus("idle");
    setMessage("");
  }, []);

  const lookupNow = useCallback(async () => {
    const activeSeq = requestSeq.current + 1;
    requestSeq.current = activeSeq;

    if (!isLookupReady(normalizedInput)) {
      setStatus("idle");
      setMessage("");
      return;
    }

    setStatus("checking");
    setMessage("Adres controleren…");

    try {
      const result = await verifyAddress(normalizedInput);
      if (requestSeq.current !== activeSeq) return;

      setStatus("success");
      setMessage("Adres gevonden.");
      onResolvedRef.current(result);
    } catch (error) {
      if (requestSeq.current !== activeSeq) return;

      if (error instanceof AddressLookupError && error.code === "unavailable") {
        setStatus("unavailable");
        setMessage("Adrescontrole is tijdelijk niet beschikbaar.");
        return;
      }

      if (
        error instanceof AddressLookupError &&
        (error.code === "invalid_postcode" || error.code === "invalid_house_number")
      ) {
        setStatus("idle");
        setMessage("");
        return;
      }

      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Adrescontrole is tijdelijk niet beschikbaar.");
    }
  }, [normalizedInput]);

  useEffect(() => {
    if (!isLookupReady(normalizedInput)) {
      clear();
      return;
    }

    const timer = window.setTimeout(() => {
      void lookupNow();
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clear, debounceMs, lookupKey, lookupNow, normalizedInput]);

  return {
    status,
    message,
    lookupNow,
    clear,
  };
}
