import fs from 'fs';

const content = fs.readFileSync('src/i18n/runtimeTranslations.ts', 'utf8');
const exactKaMatch = content.match(/const exactKa: Record<string, string> = \{([\s\S]+?)\}\r?\n\r?\nconst replacements/);

if (!exactKaMatch) {
  console.error("No match exactKa");
  process.exit(1);
}

const exactKaBlock = exactKaMatch[1];
const lines = exactKaBlock.split('\n');
const keys: string[] = [];

for (const line of lines) {
  if (line.includes(':') && !line.trim().startsWith('//')) {
    const match = line.match(/^(\s*)(?:(?:'([^']+)')|(?:"([^"]+)")|([A-Za-z0-9_]+))(\s*:\s*)/);
    if (match) {
      keys.push(match[2] || match[3] || match[4]);
    }
  }
}

let outExact = "const exactEs: Record<string, string> = {\n";
for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  outExact += `  ${JSON.stringify(k)}: ${JSON.stringify(k)},\n`;
}
outExact += "}\n";

let newContent = content;
newContent = newContent.replace(
  exactKaMatch[0],
  () => `const exactKa: Record<string, string> = {${exactKaBlock}}\n\n${outExact}\nconst replacements`
);

const replacementsKaMatch = content.match(/const replacementsKa: Array<\[RegExp, string\]> = \[\]\r?\n/);
if (!replacementsKaMatch) {
  console.error("No match replacementsKa");
  process.exit(1);
}

const outRepl = `const replacementsEs: Array<[RegExp, string]> = []\n`;

newContent = newContent.replace(
  replacementsKaMatch[0],
  () => `${replacementsKaMatch[0]}\n${outRepl}`
);

newContent = newContent.replace(
  "const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa }",
  () => "const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa, es: exactEs }"
);
newContent = newContent.replace(
  "const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa }",
  () => "const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa, es: replacementsEs }"
);

fs.writeFileSync('src/i18n/runtimeTranslations.ts', newContent, 'utf8');
console.log("SUCCESSfully patched runtime translations for ES");
