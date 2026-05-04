-- Tabela de Templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pendente' NOT NULL, -- 'pendente', 'enviado'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS e criar políticas vazias ou de acesso público
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Para fins do app simples, permitindo acesso total sem autenticação no Supabase (se desejado, ou ajustável):
CREATE POLICY "Public Access for templates" ON templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for leads" ON leads FOR ALL USING (true) WITH CHECK (true);
