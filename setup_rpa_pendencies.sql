-- ==========================================================================
-- Migration: Tabela rpa_pendencies (Gestão de Pendências de Robôs em Produção)
-- Projeto: Controle de Squads (Supabase)
-- ==========================================================================

-- 1. Cria a tabela rpa_pendencies se não existir
CREATE TABLE IF NOT EXISTS public.rpa_pendencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  robo_name TEXT NOT NULL,
  title TEXT NOT NULL,
  responsible TEXT NOT NULL DEFAULT 'Redesign',
  status TEXT NOT NULL DEFAULT 'Em Aberto',
  severity TEXT NOT NULL DEFAULT 'Média',
  description TEXT,
  history_notes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Conceder permissão de acesso via API REST (Evita 404/403)
GRANT ALL ON TABLE public.rpa_pendencies TO anon;
GRANT ALL ON TABLE public.rpa_pendencies TO authenticated;
GRANT ALL ON TABLE public.rpa_pendencies TO service_role;

-- 3. Desativar RLS temporariamente para garantir leitura/escrita total sem bloqueio
ALTER TABLE public.rpa_pendencies DISABLE ROW LEVEL SECURITY;
