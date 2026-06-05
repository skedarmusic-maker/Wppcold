const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.cxxsglfmesmivgpouilz:1q2w3e4r%40%40%40SK8388@aws-1-us-east-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao Supabase para inserir os novos templates...');

    const templates = [
      {
        name: 'GMN_Celular_IA_Var1',
        content: `Olá, boa tarde! Tudo bem?

Você também atua com otimização de perfil do Google?

Eu sou o Gabriel, trabalho com Google e criação de sites. Desenvolvi um sistema para facilitar o gerenciamento de perfis e queria te apresentar 🙏

O grande diferencial do meu sistema é que você pode fazer tudo pelo celular!
Além disso, ele conta com:
- Prospecção inteligente auxiliada por IA
- Respostas automáticas de avaliações com IA
- Criação de posts otimizados com IA
- Relatórios e mensagens automáticas direto para o WhatsApp

Se tiver interesse em conhecer como funciona, me avisa que te envio o acesso!`
      },
      {
        name: 'GMN_Celular_IA_Var2',
        content: `Olá, boa tarde!

Trabalha com otimização de ficha do Google Meu Negócio por aí?

Aqui é o Gabriel. Trabalho com SEO local e desenvolvimento de sites. Criei um aplicativo web focado em ajudar profissionais a gerenciarem suas fichas de forma rápida e prática. Se puder, dá uma olhada no que ele faz:

📱 Funciona 100% pelo celular (o grande diferencial)
🤖 Inteligência Artificial para prospectar novos clientes
💬 IA para responder avaliações e criar postagens magnéticas
📊 Envio de relatórios e mensagens automatizadas direto para o WhatsApp

Teria interesse em conhecer a ferramenta para testar nos seus clientes? 🙏`
      },
      {
        name: 'GMN_Celular_IA_Var3',
        content: `Olá, boa tarde, tudo bem?

Você trabalha na área de otimização de perfil do Google (GMN)?

Sou Gabriel, trabalho com Google e sites. Criei uma ferramenta inovadora para gerenciar perfis de clientes de forma muito mais rápida, inclusive direto pelo celular! 📱🙏

Ela ajuda você a:
1. Prospectar novos leads usando IA
2. Responder avaliações e gerar postagens com IA
3. Enviar mensagens e relatórios automáticos direto para o WhatsApp

Gostaria de ver uma demonstração rápida de como ela pode acelerar sua rotina?`
      }
    ];

    for (const t of templates) {
      await client.query("DELETE FROM templates WHERE name = $1", [t.name]);
      await client.query("INSERT INTO templates (name, content) VALUES ($1, $2)", [t.name, t.content]);
      console.log(`✅ Template ${t.name} inserido/atualizado.`);
    }

    await client.end();
    console.log('\n🌟 Todos os novos templates do Waltier inseridos com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao atualizar templates:', err.message);
  }
}

run();

