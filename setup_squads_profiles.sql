-- ============================================================
-- SCRIPT DE CRIAÇÃO E CONFIGURAÇÃO DA TABELA SQUADS_PROFILES
-- PROJETO SUPABASE ISOLADO: https://dpgtiecmicjytwhmonjw.supabase.co
-- ============================================================

-- 1. Criar a tabela squads_profiles
CREATE TABLE IF NOT EXISTS public.squads_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  nome TEXT,
  role TEXT DEFAULT 'PENDENTE',
  perfil TEXT DEFAULT 'CONSULTA',
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.squads_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Criar Políticas de Acesso RLS
DROP POLICY IF EXISTS "Permitir leitura publica de squads_profiles" ON public.squads_profiles;
CREATE POLICY "Permitir leitura publica de squads_profiles" 
  ON public.squads_profiles FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Permitir criacao e insercao de squads_profiles" ON public.squads_profiles;
CREATE POLICY "Permitir criacao e insercao de squads_profiles" 
  ON public.squads_profiles FOR INSERT 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualizacao de squads_profiles" ON public.squads_profiles;
CREATE POLICY "Permitir atualizacao de squads_profiles" 
  ON public.squads_profiles FOR UPDATE 
  USING (true);

DROP POLICY IF EXISTS "Permitir delecao de squads_profiles" ON public.squads_profiles;
CREATE POLICY "Permitir delecao de squads_profiles" 
  ON public.squads_profiles FOR DELETE 
  USING (true);

-- 4. Criar a tabela cs_board_state para persistência do Kanban e Triagem
CREATE TABLE IF NOT EXISTS public.cs_board_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cs_board_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso total a cs_board_state" ON public.cs_board_state;
CREATE POLICY "Permitir acesso total a cs_board_state" 
  ON public.cs_board_state FOR ALL 
  USING (true);

-- 5. Habilitar publicação Realtime para squads_profiles e cs_board_state
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.squads_profiles;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cs_board_state;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
