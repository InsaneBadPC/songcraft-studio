-- Canonicalize video render modes used by the agent orchestrator and renderer.
-- The legacy constraint only allowed static/legacy names, while production
-- already dispatches these three modes through agent_videos.type.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.agent_videos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.agent_videos DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

UPDATE public.agent_videos
SET type = 'static_cover'
WHERE type IN ('lyric_video', 'short', 'teaser');

ALTER TABLE public.agent_videos
  ADD CONSTRAINT agent_videos_type_check
  CHECK (type IN ('static_cover', 'image_animation', 'full_scenes'));
