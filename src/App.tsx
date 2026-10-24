import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { LocalStore, SupabaseStore } from "./lib/store";
import { useReshipData } from "./lib/useReshipData";
import { Dashboard } from "./components/Dashboard";
import { AuthScreen } from "./components/AuthScreen";

const demoStore = new LocalStore();

export default function App() {
  if (!supabase) return <ReshipApp store={demoStore} email={null} demoMode onSignOut={() => {}} />;
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
  return <Dashboard data={data} email={email} demoMode={demoMode} onSignOut={onSignOut} />;
}
