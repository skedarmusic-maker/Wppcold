const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const APIFY_TOKEN = process.env.VITE_APIFY_TOKEN;
const SUPABASE_DB = "postgresql://postgres.cxxsglfmesmivgpouilz:1q2w3e4r%40%40%40SK8388@aws-1-us-east-1.pooler.supabase.com:5432/postgres";
const DATASET_ID = "M7y6YlwkHqHdt45BT"; // Dataset com os seguidores extraídos com sucesso na corrida H9JWfBCc4mwkG2siI

// Função robusta para extrair o WhatsApp de biografias e links externos do Instagram
function extrairWhatsApp(biography, externalUrl) {
  const texto = ((biography || '') + ' ' + (externalUrl || '')).trim();
  if (!texto) return null;

  const linkPatterns = [
    /wa\.me\/([0-9\+]+)/i,
    /api\.whatsapp\.com\/send\?phone=([0-9\+]+)/i,
    /whatsapp:\/\/send\?phone=([0-9\+]+)/i
  ];

  for (const pattern of linkPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      const num = match[1].replace(/\D/g, '');
      if (num.length >= 10) {
        if (num.length >= 12 && num.startsWith('55')) {
          return num;
        }
        if (num.length === 10 || num.length === 11) {
          return '55' + num;
        }
        return num;
      }
    }
  }

  const brPhoneRegex = /(?:\+?55\s?)?\(?([1-9]{2})\)?\s?(9?\d{4})[-.\s]?(\d{4})/g;
  let matchPhone;
  while ((matchPhone = brPhoneRegex.exec(texto)) !== null) {
    const ddd = matchPhone[1];
    const parte1 = matchPhone[2];
    const parte2 = matchPhone[3];
    let num = ddd + parte1 + parte2;
    num = '55' + num;
    if (num.length === 12 || num.length === 13) {
      return num;
    }
  }

  const apenasNumeros = texto.replace(/\D/g, ' ');
  const partes = apenasNumeros.split(/\s+/);
  for (const parte of partes) {
    if (parte.length === 10 || parte.length === 11) {
      return '55' + parte;
    } else if (parte.length === 12 || parte.length === 13) {
      if (parte.startsWith('55')) {
        return parte;
      }
    }
  }

  return null;
}

// Filtra biografias relevantes
function ehGestorGMN(biography, full_name) {
  const bio = (biography || '').toLowerCase();
  const nome = (full_name || '').toLowerCase();
  const termos = [
    'google meu negocio',
    'google meu negócio',
    'gmn',
    'gestor de perfil',
    'gestor de perfis',
    'google business',
    'seo local',
    'posicionamento local',
    'otimizacao de ficha',
    'otimização de ficha',
    'fichas do google',
    'otimizo perfil',
    'otimizo ficha'
  ];

  return termos.some(termo => bio.includes(termo) || nome.includes(termo));
}

async function run() {
  console.log(`🚀 Iniciando o processamento do dataset existente: "${DATASET_ID}"...`);

  if (!APIFY_TOKEN) {
    console.error('❌ VITE_APIFY_TOKEN não encontrado no .env');
    return;
  }

  const client = new Client({
    connectionString: SUPABASE_DB,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados Supabase...');

    // 1. Obter os seguidores a partir do dataset do Apify
    console.log(`⏳ Buscando seguidores do dataset ${DATASET_ID}...`);
    const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${DATASET_ID}/items?token=${APIFY_TOKEN}`);
    const rawFollowers = await datasetRes.json();
    console.log(`✅ Recebidos ${rawFollowers.length} seguidores brutos do dataset.`);

    const usernames = [];
    const nameMap = {};
    for (const f of rawFollowers) {
      if (f.username) {
        usernames.push(f.username);
        nameMap[f.username] = f.full_name || f.username;
      }
    }

    console.log(`Total de usernames válidos extraídos: ${usernames.length}`);
    if (usernames.length === 0) {
      console.log('⚠️ Nenhum username válido no dataset.');
      return;
    }

    // 2. Filtrar os que já existem na tabela leads do Supabase
    const novelUsernames = [];
    for (const username of usernames) {
      const check = await client.query("SELECT id FROM leads WHERE restaurant_name LIKE $1", [`%@${username}%`]);
      if (check.rows.length === 0) {
        novelUsernames.push(username);
      }
    }

    console.log(`📊 Perfis inéditos para analisar: ${novelUsernames.length} (pulando ${usernames.length - novelUsernames.length} já existentes)`);
    if (novelUsernames.length === 0) {
      console.log('✨ Todos os seguidores deste lote já foram processados anteriormente.');
      return;
    }

    // 3. Pegar os primeiros 150 perfis inéditos para enriquecer e qualificar nesta execução
    const batchToAnalyze = novelUsernames.slice(0, 150);
    console.log(`🔥 Lote selecionado para análise detalhada de biografia: ${batchToAnalyze.length} perfis.`);

    // 4. Rodar o Profile Scraper do Apify para buscar biografias e links
    console.log(`⏳ Iniciando a raspagem de perfil no Apify para ${batchToAnalyze.length} usuários...`);
    const profileInput = {
      usernames: batchToAnalyze,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"]
      }
    };

    const profileRes = await fetch(`https://api.apify.com/v2/acts/logical_scrapers~instagram-profile-scraper/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileInput)
    });

    const profileData = await profileRes.json();
    if (!profileData.data || !profileData.data.id) {
      console.error('❌ Erro ao iniciar raspagem detalhada no Apify:', profileData.error || profileData);
      return;
    }

    const pRunId = profileData.data.id;
    const pDatasetId = profileData.data.defaultDatasetId;
    console.log(`Corrida de perfis iniciada: ${pRunId}. Aguardando conclusão...`);

    let pStatus = 'RUNNING';
    while (pStatus !== 'SUCCEEDED' && pStatus !== 'FAILED' && pStatus !== 'ABORTED') {
      await new Promise(r => setTimeout(r, 6000));
      const pStatusRes = await fetch(`https://api.apify.com/v2/actor-runs/${pRunId}?token=${APIFY_TOKEN}`);
      const pStatusData = await pStatusRes.json();
      pStatus = pStatusData.data.status;
      process.stdout.write('.');
    }
    console.log(`\n✅ Raspagem detalhada concluída com status: ${pStatus}`);

    if (pStatus !== 'SUCCEEDED') {
      console.error('❌ O robô de biografias falhou.');
      return;
    }

    const pDatasetRes = await fetch(`https://api.apify.com/v2/datasets/${pDatasetId}/items?token=${APIFY_TOKEN}`);
    const profiles = await pDatasetRes.json();

    console.log(`Qualificando as biografias e extraindo contatos...`);
    let leadsSalvos = 0;

    for (const profile of profiles) {
      const bioText = profile.bio || '';
      const displayNameRaw = profile.name || profile.username;
      
      const isGMN = ehGestorGMN(bioText, displayNameRaw);
      
      if (isGMN) {
        const linksArray = (profile.bioLinks || []).map(link => {
          if (typeof link === 'object') return link.url || link.rawUrl || '';
          return link || '';
        });
        const linksText = linksArray.join(' ');

        const numeroRaw = extrairWhatsApp(bioText, linksText);
        if (numeroRaw) {
          // Checar duplicidade de telefone
          const checkPhone = await client.query("SELECT id FROM leads WHERE phone = $1", [numeroRaw]);
          if (checkPhone.rows.length === 0) {
            const displayName = `${displayNameRaw} (@${profile.username})`;
            await client.query(`
              INSERT INTO leads (restaurant_name, phone, status)
              VALUES ($1, $2, 'pendente')
            `, [
              displayName,
              numeroRaw
            ]);
            console.log(`  🎯 [MATCH!] @${profile.username} é Gestor GMN - WA: ${numeroRaw} (Salvo na tabela leads!)`);
            leadsSalvos++;
          } else {
            console.log(`  ℹ️ @${profile.username} é Gestor GMN - WA: ${numeroRaw} (Ignorado: telefone já cadastrado)`);
          }
        } else {
          console.log(`  ℹ️ Gestor GMN encontrado: @${profile.username}, mas não possui WhatsApp na biografia.`);
        }
      }
    }

    console.log(`\n📊 Resumo da Operação:`);
    console.log(`- Perfis analisados detalhadamente: ${profiles.length}`);
    console.log(`- Novos Gestores GMN qualificados e inseridos na tabela leads: ${leadsSalvos}`);
    console.log(`- Acesse a aba Lista de Leads (Pendentes) no app Coudmsg para enviar as mensagens!`);

  } catch (error) {
    console.error('❌ Erro crítico:', error);
  } finally {
    await client.end();
  }
}

run();
