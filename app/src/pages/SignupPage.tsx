import { SignupPageShell } from "../features/signup/SignupPageShell";
import type { RoutedPageProps } from "../routes/types";

export function SignupPage(props: RoutedPageProps) {
  return <SignupPageShell {...props} />;
}
