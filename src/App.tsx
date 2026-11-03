import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { LocalStore, SupabaseStore } from "./lib/store";
import { useReshipData } from "./lib/useReshipData";
import { AppShell } from "./components/shell/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { AffiliateProgramPage } from "./components/affiliates/AffiliateProgramPage";
import { captureReferral, clearReferral, pendingReferral } from "./lib/referralCapture";
import { HomePage } from "./components/landing/HomePage";
import { MissionPage } from "./components/mission/MissionPage";

const demoStore = new LocalStore();
// sellsync…/?demo opens the demo with sample orders even where accounts are set up, for showing
// SellSync to people without signing in.
const demoRequested = new URLSearchParams(window.location.search).has("demo");
// sellsync…/?affiliates is the public page about the affiliate program, for sharing.
const programPageRequested = new URLSearchParams(window.location.search).has("affiliates");
// sellsync…/?mission is the public page with SellSync's mission and philosophy.
const missionRequested = new URLSearchParams(window.location.search).has("mission");
// sellsync…/?welcome shows the public homepage even when signed in or running without accounts.
const welcomeRequested = new URLSearchParams(window.location.search).has("welcome");

// sellsync…/?ref=code is an affiliate's link: remember who sent this visitor and count the visit.
const referredBy = captureReferral();
if (referredBy) void supabase?.rpc("record_referral_click", { p_code: referredBy });

type AuthMode = "signin" | "signup";

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  if (programPageRequested) return <AffiliateProgramPage />;
  if (missionRequested) return <MissionPage />;
  if (welcomeRequested && !authMode) {
    // Without accounts set up, the homepage's sign-in buttons open the demo instead.
    const enter = supabase ? setAuthMode : () => window.location.assign("/?demo");
    return <HomePage onSignIn={() => enter("signin")} onSignUp={() => enter("signup")} />;
  }
  if (!supabase || demoRequested) return <SellSyncApp store={demoStore} email={null} demoMode onSignOut={() => {}} />;
  return <SignedInGate initialAuthMode={authMode} />;
}

function SignedInGate({ initialAuthMode }: { initialAuthMode: AuthMode | null }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Signed-out visitors see the homepage until they choose to sign in or create an account.
  const [authMode, setAuthMode] = useState<AuthMode | null>(initialAuthMode);
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
  if (!session || !store) {
    if (!authMode) return <HomePage onSignIn={() => setAuthMode("signin")} onSignUp={() => setAuthMode("signup")} />;
    return <AuthScreen key={authMode} initialMode={authMode} onBack={() => setAuthMode(null)} />;
  }
  return <SellSyncApp key={userId} store={store} email={session.user.email ?? null} demoMode={false} onSignOut={() => supabase!.auth.signOut()} />;
}

function SellSyncApp({
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
