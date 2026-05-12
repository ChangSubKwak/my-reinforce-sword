-- 검 강화 게임 — Supabase 스키마
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- 한 번만 실행하면 됩니다.

-- ============================================================
-- 1) user_state — 사용자별 진행도 (JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_state (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE public.user_state ENABLE ROW LEVEL SECURITY;

-- 자기 데이터만 읽기
DROP POLICY IF EXISTS "user_state_select_own" ON public.user_state;
CREATE POLICY "user_state_select_own" ON public.user_state
  FOR SELECT USING (auth.uid() = user_id);

-- 자기 데이터만 추가
DROP POLICY IF EXISTS "user_state_insert_own" ON public.user_state;
CREATE POLICY "user_state_insert_own" ON public.user_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 자기 데이터만 갱신
DROP POLICY IF EXISTS "user_state_update_own" ON public.user_state;
CREATE POLICY "user_state_update_own" ON public.user_state
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 2) leaderboard — 공개 랭킹
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname       TEXT NOT NULL,
  best_level     INT  NOT NULL DEFAULT 0,
  way_reached    INT  NOT NULL DEFAULT 0,
  total_slain    INT  NOT NULL DEFAULT 0,
  sealed_count   INT  NOT NULL DEFAULT 0,
  total_destroyed INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 정렬용 인덱스
CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
  ON public.leaderboard (way_reached DESC, best_level DESC, total_slain DESC);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- 누구나 (인증 안 된 사용자 포함) 리더보드 읽기 가능
DROP POLICY IF EXISTS "leaderboard_select_all" ON public.leaderboard;
CREATE POLICY "leaderboard_select_all" ON public.leaderboard
  FOR SELECT USING (true);

-- 인증된 사용자만 자기 점수 등록
DROP POLICY IF EXISTS "leaderboard_insert_own" ON public.leaderboard;
CREATE POLICY "leaderboard_insert_own" ON public.leaderboard
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 자기 점수만 갱신
DROP POLICY IF EXISTS "leaderboard_update_own" ON public.leaderboard;
CREATE POLICY "leaderboard_update_own" ON public.leaderboard
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 3) updated_at 자동 갱신 트리거 (선택적)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_state_updated_at ON public.user_state;
CREATE TRIGGER user_state_updated_at
  BEFORE UPDATE ON public.user_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS leaderboard_updated_at ON public.leaderboard;
CREATE TRIGGER leaderboard_updated_at
  BEFORE UPDATE ON public.leaderboard
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
