-- The AI helper (assistant Edge Function): each question counts toward a daily cap per user,
-- logged in ai_usage like the AI listing calls and comps searches. Safe to run more than once. Needs 0012_research_comps.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('detect', 'group', 'describe', 'photo', 'comps', 'assistant'));
