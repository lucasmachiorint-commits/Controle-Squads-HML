const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://maguyzjhldcgpcvkvkqe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZ3V5empobGRjZ3Bjdmt2a3FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTU0MDMsImV4cCI6MjEwMDIzMTQwM30.Ow9xruE1qAFTX3mqELERxrY3CRBOdV_n4MoXXhtt3Y8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  console.log('Testando conexão Supabase...');
  
  // Testar seleção da tabela demands
  const { data: demands, error: errDemands } = await supabase.from('demands').select('*').limit(5);
  console.log('Tabela demands:', { count: demands ? demands.length : 0, error: errDemands ? errDemands.message : null });

  // Testar seleção da tabela users_profile
  const { data: profiles, error: errProfiles } = await supabase.from('users_profile').select('*').limit(5);
  console.log('Tabela users_profile:', { count: profiles ? profiles.length : 0, error: errProfiles ? errProfiles.message : null });
}

testConnection();
