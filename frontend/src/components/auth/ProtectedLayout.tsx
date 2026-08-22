import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { NavShell } from "@/components/layout/NavShell";

/** Gates the whole app shell (Home/Chat/Find Care/My Data/Profile) behind a Clerk session. */
export function ProtectedLayout() {
  return (
    <>
      <SignedIn>
        <NavShell />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
