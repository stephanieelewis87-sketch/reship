import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { LocalStore, SupabaseStore } from "./lib/store";
import { useReshipData } from "./lib/useReshipData";
import { Dashboard } from "./components/Dashboard";
import { AuthScreen } from "./components/AuthScreen";
import { HomePage } from "./components/landing/HomePage";

const demoStore = new LocalStore();
// reship…/?demo opens the demo with sample orders even where accounts are set up, for showing
// Reship to people without signing in.
const demoRequested = new URLSearchParams(window.location.search).has("demo");
// reship…/?welcome shows the public homepage even when signed in or running without accounts.
const welcomeRequested = new URLSearchParams(window.location.search).has("welcome");

type AuthMode = "signin" | "signup";

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  if (welcomeRequested && !authMode) {
    // Without accounts set up, the homepage's sign-in buttons open the demo instead.
    const enter = supabase ? setAuthMode : () => window.location.assign("/?demo");
    return <HomePage onSignIn={() => enter("signin")} onSignUp={() => enter("signup")} />;
  }
  if (!supabase || demoRequested) return <ReshipApp store={demoStore} email={null} demoMode onSignOut={() => {}} />;
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

  if (session === undefined) return null;
  if (recovering && session) return <AuthScreen recovery onRecovered={() => setRecovering(false)} />;
  if (!session || !store) {
    if (!authMode) return <HomePage onSignIn={() => setAuthMode("signin")} onSignUp={() => setAuthMode("signup")} />;
    return <AuthScreen key={authMode} initialMode={authMode} onBack={() => setAuthMode(null)} />;
  }
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
  return <Dashboard data={data} email={email} demoMode={demoMode} onSignOut={onSignOut} onResetDemo={resetDemo} />;
}
