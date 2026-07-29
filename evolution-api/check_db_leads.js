const { Client } = require('pg');

const SUPABASE_DB = "postgresql://postgres.cxxsglfmesmivgpouilz:1q2w3e4r%40%40%40SK8388@aws-1-us-east-1.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({
    connectionString: SUPABASE_DB,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados Supabase...');

    // 1. Mostrar colunas da tabela leads
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads';
    `);
    console.log('\n📊 Colunas da tabela leads:');
    colsRes.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type}`);
    });

    // 2. Contar leads por status
    const statusRes = await client.query(`
      SELECT status, COUNT(*) as total 
      FROM leads 
      GROUP BY status;
    `);
    console.log('\n📊 Contagem por status:');
    statusRes.rows.forEach(row => {
      console.log(`- ${row.status}: ${row.total}`);
    });

    // 3. Ver algumas amostras de leads pendentes
    const sampleRes = await client.query(`
      SELECT * 
      FROM leads 
      WHERE status = 'pendente' 
      LIMIT 10;
    `);
    console.log('\n📊 Amostra de leads pendentes:');
    console.log(JSON.stringify(sampleRes.rows, null, 2));

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.end();
  }
}

run();
