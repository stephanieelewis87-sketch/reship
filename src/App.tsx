import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { LocalStore, SupabaseStore } from "./lib/store";
import { useReshipData } from "./lib/useReshipData";
import { AppShell } from "./components/shell/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { AffiliateProgramPage } from "./components/affiliates/AffiliateProgramPage";
import { captureReferral, clearReferral, pendingReferral } from "./lib/referralCapture";

const demoStore = new LocalStore();
// reship…/?demo opens the demo with sample orders even where accounts are set up, for showing
// Reship to people without signing in.
const demoRequested = new URLSearchParams(window.location.search).has("demo");
// reship…/?affiliates is the public page about the affiliate program, for sharing.
const programPageRequested = new URLSearchParams(window.location.search).has("affiliates");

// reship…/?ref=code is an affiliate's link: remember who sent this visitor and count the visit.
const referredBy = captureReferral();
if (referredBy) void supabase?.rpc("record_referral_click", { p_code: referredBy });

export default function App() {
  if (programPageRequested) return <AffiliateProgramPage />;
  if (!supabase || demoRequested) return <ReshipApp store={demoStore} email={null} demoMode onSignOut={() => {}} />;
  return <SignedInGate />;
}

function SignedInGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // True after opening a password reset email link, until a new password is saved.
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const store = useMemo(() => (userId ? new SupabaseStore(userId) : null), [userId]);

  // A seller who arrived through an affiliate's link is credited to that affiliate once signed in.
  useEffect(() => {
    const code = pendingReferral();
    if (!store || !code) return;
    store.affiliates.claim(code).then(clearReferral, () => undefined);
  }, [store]);

  if (session === undefined) return null;
  if (recovering && session) return <AuthScreen recovery onRecovered={() => setRecovering(false)} />;
  if (!session || !store) return <AuthScreen />;
  return <ReshipApp key={userId} store={store} email={session.user.email ?? null} demoMode={false} onSignOut={() => supabase!.auth.signOut()} />;
}

function ReshipApp({
  store,
  email,
  demoMode,
  onSignOut,
}: {
  store: LocalStore | SupabaseStore;
  email: string | null;
  demoMode: boolean;
  onSignOut: () => void;
}) {
  const data = useReshipData(store);
  const resetDemo =
    store instanceof LocalStore
      ? () => {
          store.reset();
          window.location.reload();
        }
      : undefined;
  return <AppShell data={data} email={email} demoMode={demoMode} onSignOut={onSignOut} onResetDemo={resetDemo} />;
}
