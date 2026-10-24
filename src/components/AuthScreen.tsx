import { useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Field, inputClass, primaryButton } from "./ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup" && !data.session) setMessage("Check your email to confirm your account, then sign in.");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border border-border rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#B5607A] flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-semibold text-foreground text-lg">Reship</span>
        </div>
        <h1 className="font-display text-base font-semibold">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
        <Field label="Email">
          <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-xs text-[#B5607A] hover:underline"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
