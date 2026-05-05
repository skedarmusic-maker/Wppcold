import pkg from 'xlsx';
const { readFile, utils } = pkg;

const workbook = readFile('dataset_crawler-google-places_2026-05-05_12-16-16-322.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = utils.sheet_to_json(sheet, { header: 1 });

console.log("Headers:");
console.log(data[0]);
console.log("\nFirst row sample:");
console.log(data[1]);
