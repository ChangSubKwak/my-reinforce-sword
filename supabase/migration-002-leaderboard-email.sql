-- 마이그레이션 002: leaderboard 테이블에 email 컬럼 추가
-- Supabase Dashboard → SQL Editor 에서 한 번 실행

ALTER TABLE public.leaderboard
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 기존 사용자의 email은 NULL — 다음 점수 등록 시 자동 채워짐
