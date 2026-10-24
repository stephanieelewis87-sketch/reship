import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Field, inputClass, primaryButton, secondaryButton } from "./ui";

type Mode = "signin" | "signup" | "forgot" | "reset";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "azure", label: "Microsoft" },
  { id: "apple", label: "Apple" },
];

// Sign-in options the Supabase project has turned on (Authentication > Sign In / Providers).
// Buttons only appear for providers that are set up, so none show until one is configured.
function useEnabledProviders() {
  const [enabled, setEnabled] = useState<Provider[]>([]);
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((res) => (res.ok ? res.json() : null))
      .then((settings: { external?: Record<string, boolean> } | null) =>
        setEnabled(PROVIDERS.map((p) => p.id).filter((id) => settings?.external?.[id])),
      )
      .catch(() => {});
  }, []);
  return enabled;
}

// recovery: the person arrived from a password reset email and is choosing a new password.
export function AuthScreen({ recovery = false, onRecovered }: { recovery?: boolean; onRecovered?: () => void }) {
  const [mode, setMode] = useState<Mode>(recovery ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const providers = useEnabledProviders();

  const switchTo = (next: Mode) => {
    setMode(next);
    setMessage("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const back = window.location.origin;
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    } else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: back } });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Check your email to confirm your account, then sign in.");
    } else if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: back });
      setMessage(error ? error.message : "If that email has a Reship account, a reset link is on its way. Open it on this device.");
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMessage(error.message);
      else onRecovered?.();
    }
    setBusy(false);
  };

  const continueWith = async (provider: Provider) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) setMessage(error.message);
  };

  const title = { signin: "Sign in", signup: "Create your account", forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const submitLabel = { signin: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" }[mode];
  const showProviders = providers.length > 0 && (mode === "signin" || mode === "signup");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border border-border rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#B5607A] flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-semibold text-foreground text-lg">Reship</span>
        </div>
        <h1 className="font-display text-base font-semibold">{title}</h1>

        {showProviders && (
          <>
            <div className="space-y-2">
              {PROVIDERS.filter((p) => providers.includes(p.id)).map((p) => (
                <button key={p.id} type="button" onClick={() => continueWith(p.id)} className={`w-full ${secondaryButton}`}>
                  Continue with {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or use email
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        {mode !== "reset" && (
          <Field label="Email">
            <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        {mode !== "forgot" && (
          <Field label={mode === "reset" ? "New password" : "Password"}>
            <input
              type="password"
              required
              minLength={mode === "signin" ? undefined : 8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {mode === "signin" && (
          <button type="button" onClick={() => switchTo("forgot")} className="-mt-2 text-xs text-[#B5607A] hover:underline">
            Forgot password?
          </button>
        )}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {busy ? "One moment…" : submitLabel}
        </button>
        {mode !== "reset" && (
          <button
            type="button"
            onClick={() => switchTo(mode === "signin" ? "signup" : "signin")}
            className="w-full text-xs text-[#B5607A] hover:underline"
          >
            {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
