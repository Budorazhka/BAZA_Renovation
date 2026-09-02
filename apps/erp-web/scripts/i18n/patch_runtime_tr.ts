import fs from 'fs';

const content = fs.readFileSync('src/i18n/runtimeTranslations.ts', 'utf8');
const exactEsMatch = content.match(/const exactEs: Record<string, string> = \{([\s\S]+?)\}\r?\n\r?\nconst replacements/);

if (!exactEsMatch) {
  console.error("No match exactEs");
  process.exit(1);
}

const exactEsBlock = exactEsMatch[1];
const lines = exactEsBlock.split('\n');
const keys: string[] = [];

for (const line of lines) {
  if (line.includes(':') && !line.trim().startsWith('//')) {
    const match = line.match(/^(\s*)(?:(?:'([^']+)')|(?:"([^"]+)")|([A-Za-z0-9_]+))(\s*:\s*)/);
    if (match) {
      keys.push(match[2] || match[3] || match[4]);
    }
  }
}

let outExact = "const exactTr: Record<string, string> = {\n";
for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  outExact += `  ${JSON.stringify(k)}: ${JSON.stringify(k)},\n`;
}
outExact += "}\n";

let newContent = content;
newContent = newContent.replace(
  exactEsMatch[0],
  () => `const exactEs: Record<string, string> = {${exactEsBlock}}\n\n${outExact}\nconst replacements`
);

const replacementsEsMatch = content.match(/const replacementsEs: Array<\[RegExp, string\]> = \[\]\r?\n/);
if (!replacementsEsMatch) {
  console.error("No match replacementsEs");
  process.exit(1);
}

const outRepl = `const replacementsTr: Array<[RegExp, string]> = []\n`;

newContent = newContent.replace(
  replacementsEsMatch[0],
  () => `${replacementsEsMatch[0]}\n${outRepl}`
);

newContent = newContent.replace(
  "const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa, es: exactEs }",
  () => "const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa, es: exactEs, tr: exactTr }"
);
newContent = newContent.replace(
  "const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa, es: replacementsEs }",
  () => "const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa, es: replacementsEs, tr: replacementsTr }"
);

fs.writeFileSync('src/i18n/runtimeTranslations.ts', newContent, 'utf8');
console.log("SUCCESSfully patched runtime translations for TR");
