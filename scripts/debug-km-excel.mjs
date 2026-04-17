import XLSX from 'xlsx';

const filepath = '/Users/ionpop/Downloads/98 Corjeuti - ChisinauBriceni by KM.xlsx';
const wb = XLSX.readFile(filepath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log('Sheet name:', wb.SheetNames[0]);
console.log('Headers:', Object.keys(rows[0]));
console.log('Total rows:', rows.length);
console.log('\nFirst 3 rows:');
for (let i = 0; i < 3; i++) {
  console.log(`Row ${i}:`, JSON.stringify(rows[i]));
}

console.log('\nRows with km > 1000:');
let badCount = 0;
for (const row of rows) {
  const km = parseFloat(row['Расстояние'] || row['Distance'] || 0);
  if (km > 1000) {
    console.log(JSON.stringify(row));
    badCount++;
    if (badCount >= 5) break;
  }
}
console.log(`Total bad rows: ${rows.filter(r => parseFloat(r['Расстояние'] || r['Distance'] || 0) > 1000).length}`);
