-- Rename dossier_chargers.meter_id -> mid_number (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dossier_chargers'
      AND column_name = 'meter_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dossier_chargers'
      AND column_name = 'mid_number'
  ) THEN
    ALTER TABLE public.dossier_chargers RENAME COLUMN meter_id TO mid_number;
  END IF;
END $$;

-- Ensure NOT NULL (only if column exists and is nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dossier_chargers'
      AND column_name = 'mid_number'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.dossier_chargers
      ALTER COLUMN mid_number SET NOT NULL;
  END IF;
END $$;
