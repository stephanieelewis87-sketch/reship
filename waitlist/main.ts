import { joinWaitlist, saveAnswers, sourceFromUrl, type Stage, type WaitlistConfig } from "./waitlist";

const config: WaitlistConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

// Small line icons (lucide style), so the page needs no icon library.
const ICONS: Record<string, string> = {
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  label: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h5"/><path d="M8 15v3M10.5 15v3M13 15v3M15.5 15v3"/>',
  return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
};
document.querySelectorAll<HTMLElement>("i[data-icon]").forEach((el) => {
  const paths = ICONS[el.dataset.icon ?? ""];
  if (paths) {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }
});

document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));

const toastEl = document.getElementById("toast")!;
let toastTimer = 0;
function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3200);
}

const thanks = document.getElementById("thanks") as HTMLDialogElement;
const answers = document.getElementById("answers") as HTMLFormElement;
let joinedEmail = "";

const source = sourceFromUrl(window.location.href);
const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer.slice(0, 300) : null;

const ERRORS = {
  invalid_email: "That email doesn't look quite right. Mind checking it?",
  network: "We couldn't reach the server. Check your connection and try again.",
  server: "Something went wrong on our side. Please try again in a moment.",
} as const;

function markAllDone(email: string) {
  document.querySelectorAll<HTMLFormElement>("[data-form]").forEach((form) => {
    form.classList.remove("invalid");
    form.classList.add("done");
    const note = form.querySelector<HTMLElement>("[data-note]")!;
    note.textContent = `You're on the list as ${email}. We'll be in touch when your spot opens.`;
  });
}

document.querySelectorAll<HTMLFormElement>("[data-form]").forEach((form) => {
  const input = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const note = form.querySelector<HTMLElement>("[data-note]")!;
  const defaultNote = note.textContent ?? "";
  const label = button.textContent ?? "";

  input.addEventListener("input", () => {
    if (form.classList.contains("invalid")) {
      form.classList.remove("invalid");
      note.textContent = defaultNote;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // Bots fill in the hidden field; quietly pretend it worked.
    const honeypot = form.querySelector<HTMLInputElement>('input[name="company"]');
    if (honeypot?.value) {
      markAllDone(input.value.trim());
      return;
    }

    button.disabled = true;
    button.textContent = "Saving your spot…";
    const result = await joinWaitlist(config, input.value, source, referrer);
    button.disabled = false;
    button.textContent = label;

    if (!result.ok) {
      form.classList.add("invalid");
      note.textContent = ERRORS[result.reason];
      input.focus();
      return;
    }

    joinedEmail = input.value.trim().toLowerCase();
    markAllDone(joinedEmail);
    answers.reset();
    if (typeof thanks.showModal === "function") thanks.showModal();
    else toast("You're on the list!");
  });
});

answers.addEventListener("submit", async (event) => {
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.value !== "save") return; // Skip just closes the dialog.
  event.preventDefault();

  const data = new FormData(answers);
  const marketplaces = data.getAll("mp").map(String);
  const stage = (data.get("stage") as Stage | null) ?? null;
  if (marketplaces.length === 0 && !stage) {
    thanks.close();
    return;
  }

  submitter.disabled = true;
  const saved = await saveAnswers(config, joinedEmail, marketplaces, stage);
  submitter.disabled = false;
  thanks.close();
  toast(saved ? "Thanks! That helps us invite the right sellers first." : "You're on the list, but we couldn't save those answers.");
});
