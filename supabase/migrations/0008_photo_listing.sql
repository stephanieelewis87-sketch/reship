-- "List from photos": the video-listing function gets a "group" action (sorting a batch of photos
-- into items), logged in ai_usage like the others for the daily cap.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('detect', 'group', 'describe', 'photo'));
