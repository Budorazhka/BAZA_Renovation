import fs from 'fs';

for (const lang of ['ka', 'tr', 'es']) {
  if (!fs.existsSync(`${lang}_dict.json`)) {
    console.log(`Skipping ${lang}_dict.json`);
    continue;
  }
  
  const content = fs.readFileSync(`${lang}_dict.json`, 'utf8');
  const data = JSON.parse(content);
  
  const tsContent = `export const ${lang} = ${JSON.stringify(data, null, 2)} as const;\n`;
  fs.writeFileSync(`src/i18n/dictionaries/${lang}.ts`, tsContent, 'utf8');
  console.log(`src/i18n/dictionaries/${lang}.ts created`);
}
