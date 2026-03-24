-- Add missing color column for connection lines

ALTER TABLE public.connections 
ADD COLUMN IF NOT EXISTS color TEXT;
