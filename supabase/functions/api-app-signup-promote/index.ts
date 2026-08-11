import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleSignupPromotion } from "../_shared/signup_promotion.ts";

export const handler = handleSignupPromotion;

if (import.meta.main) {
  serve(handler);
}
