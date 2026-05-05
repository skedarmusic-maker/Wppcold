import fs from 'fs';
import pkg from 'xlsx';
const { readFile, utils, writeFile } = pkg;

const workbook = readFile('dataset_crawler-google-places_2026-05-05_12-16-16-322.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = utils.sheet_to_json(sheet);

function extractWhatsApp(phoneStr) {
  if (!phoneStr) return null;
  // Remove tudo que não for número
  const digits = phoneStr.toString().replace(/\D/g, '');
  
  let number = digits;
  // Se começar com 55 (código do Brasil), remove pra facilitar a checagem
  if (number.startsWith('55') && number.length > 11) {
    number = number.substring(2);
  }

  // Um número de celular no Brasil tem 11 dígitos (DDD + 9 + 8 dígitos)
  // O terceiro dígito (índice 2) precisa ser um 9 ou 8 (mas hj em dia quase todos são 9)
  // Alguns lugares ainda têm o 9 implícito, mas a regra geral pra Whatsapp é ter 11 digitos com 9 na frente.
  if (number.length === 11 && number[2] === '9') {
    return `55${number}`; // Retorna no formato limpo com 55 pra WhatsApp
  }
  
  // Algumas vezes o número pode vir com 10 dígitos e ser um celular válido se faltar o 9, 
  // mas pra garantir que é WhatsApp (celular) vamos filtrar rigidamente os de 11 dígitos.
  return null;
}

const filteredData = [];

for (const row of data) {
  const title = row['title'];
  const phone = row['phone'];
  const score = parseFloat(row['totalScore']);

  // Filtra por nota acima de 3.5
  if (!isNaN(score) && score > 3.5) {
    const wppNumber = extractWhatsApp(phone);
    // Filtra apenas números válidos de WhatsApp
    if (wppNumber) {
      filteredData.push({
        Restaurante: title,
        WhatsApp: wppNumber,
        Nota: score
      });
    }
  }
}

// Cria uma nova planilha com os dados filtrados
const newSheet = utils.json_to_sheet(filteredData);
const newWorkbook = utils.book_new();
utils.book_append_sheet(newWorkbook, newSheet, "WhatsApp Contatos");

const outputFileName = 'contatos_whatsapp_filtrados.xlsx';
writeFile(newWorkbook, outputFileName);

console.log(`Sucesso! Processados ${data.length} registros originais.`);
console.log(`Encontrados ${filteredData.length} contatos válidos (Nota > 3.5 e número de celular).`);
console.log(`Arquivo salvo como: ${outputFileName}`);
