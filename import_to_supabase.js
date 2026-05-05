import { createClient } from '@supabase/supabase-js';
import pkg from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();

const { readFile, utils } = pkg;

// Configuração Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function importLeads() {
  try {
    const workbook = readFile('contatos_whatsapp_filtrados.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = utils.sheet_to_json(sheet);

    console.log(`Lendo ${data.length} contatos do arquivo...`);

    const leadsToInsert = data.map(item => ({
      restaurant_name: item.Restaurante,
      phone: item.WhatsApp,
      status: 'pendente'
    }));

    const { data: insertedData, error } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select();

    if (error) {
      throw error;
    }

    console.log('✅ Sucesso! Leads importados para o Supabase.');
    console.log(`Foram inseridos ${insertedData.length} novos leads.`);
  } catch (err) {
    console.error('❌ Erro ao importar leads:', err.message);
  }
}

importLeads();
