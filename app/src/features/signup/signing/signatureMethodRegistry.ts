import type { SignatureMethodId, SignatureMethodPort } from "./signatureMethod";

export type SignatureMethodRegistry = {
  register(method: SignatureMethodPort): void;
  get(methodId: SignatureMethodId): SignatureMethodPort | null;
  require(methodId: SignatureMethodId): SignatureMethodPort;
  list(): readonly SignatureMethodPort[];
};

export function createSignatureMethodRegistry(): SignatureMethodRegistry {
  const methods = new Map<SignatureMethodId, SignatureMethodPort>();
  return {
    register(method) {
      if (methods.has(method.methodId)) {
        throw new Error(
          `signature_method_already_registered:${method.methodId}`,
        );
      }
      methods.set(method.methodId, method);
    },
    get(methodId) {
      return methods.get(methodId) || null;
    },
    require(methodId) {
      const method = methods.get(methodId);
      if (!method) {
        throw new Error(`signature_method_not_registered:${methodId}`);
      }
      return method;
    },
    list() {
      return [...methods.values()];
    },
  };
}
