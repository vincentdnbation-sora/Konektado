-- Add avatar column to profiles table
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar" TEXT;
