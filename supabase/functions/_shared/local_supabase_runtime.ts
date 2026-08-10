export type ServerRuntimeEnvironment = {
  get(name: string): string | undefined;
};

export function isLocalSupabaseRuntime(supabaseUrl: string): boolean {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "http:") return false;
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      return true;
    }
    return url.hostname === "kong" && url.port === "8000" &&
      url.username === "" && url.password === "" && url.pathname === "/" &&
      url.search === "" && url.hash === "";
  } catch (_error) {
    return false;
  }
}
