-- Fix missing connection columns
ALTER TABLE public.connections
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS arrow_start TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS arrow_end TEXT DEFAULT 'standard';

-- Fix cards collectionId column casing
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='cards' and column_name='collectionId') THEN
      ALTER TABLE public.cards RENAME COLUMN "collectionId" TO collection_id;
  END IF;
END $$;

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS collection_id TEXT;
