import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const newMessage = `💸 CHEGA DE TRABALHAR PRA SUSTENTAR O IFOOD! 💸

Olá! Cansado de deixar quase 27% de cada pedido nas mãos do iFood?

Eu tenho a solução: o MENUVI. 🚀
Seu próprio cardápio digital onde você paga apenas 1% por pedido.

Compare o lucro no bolso:
🔴 iFood: Taxas de até 27% + promoções "obrigatórias".
🟢 Menuvi: Apenas 1% por venda.

Isso significa que, a cada R$ 1.000,00 vendidos:
❌ No iFood, você perde R$ 270,00.
✅ No Menuvi, você gasta só R$ 10,00.

Pare de espremer seu lucro e ser escravo de plataforma. É hora de fidelizar o SEU cliente e dobrar sua margem. 📈

🎁 PROMOÇÃO DE LANÇAMENTO:
Vou liberar o sistema com ADESÃO ZERO para os 3 primeiros que responderem.

Quer recuperar seu lucro ainda hoje? Responda "SIM"! 🚀`;

async function update() {
  const { data, error } = await supabase
    .from('templates')
    .update({ content: newMessage })
    .eq('name', 'Abordagem Inicial');

  if (error) {
    console.error('Erro:', error);
  } else {
    console.log('✅ Template do Menuvi atualizado com sucesso no Supabase!');
  }
}

update();
