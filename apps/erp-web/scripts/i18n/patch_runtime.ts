import fs from 'fs';

const content = fs.readFileSync('src/i18n/runtimeTranslations.ts', 'utf8');
const exactEnMatch = content.match(/const exactEn: Record<string, string> = \{([\s\S]+?)\}\r?\n\r?\nconst replacements/);

if (!exactEnMatch) {
  console.error("No match exactEn");
  process.exit(1);
}

const exactEnBlock = exactEnMatch[1];
const lines = exactEnBlock.split('\n');
const keys: string[] = [];

for (const line of lines) {
  if (line.includes(':') && !line.trim().startsWith('//')) {
    const match = line.match(/^(\s*)(?:(?:'([^']+)')|(?:"([^"]+)")|([A-Za-z0-9_]+))(\s*:\s*)/);
    if (match) {
      keys.push(match[2] || match[3] || match[4]);
    }
  }
}

let outExact = "const exactKa: Record<string, string> = {\n";
for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  outExact += `  ${JSON.stringify(k)}: ${JSON.stringify(k)},\n`;
}
outExact += "}\n";

let newContent = content;
newContent = newContent.replace(
  exactEnMatch[0],
  () => `const exactEn: Record<string, string> = {${exactEnBlock}}\n\n${outExact}\nconst replacements`
);

const replacementsMatch = content.match(/const replacements: Array<\[RegExp, string\]> = \[([\s\S]+?)\]\r?\n\r?\nconst textOriginals/);
const replacementsBlock = replacementsMatch![1];
const outRepl = `const replacementsKa: Array<[RegExp, string]> = []\n`;

newContent = newContent.replace(
  replacementsMatch[0],
  () => `const replacements: Array<[RegExp, string]> = [${replacementsBlock}]\n\n${outRepl}\nconst textOriginals`
);

newContent = newContent.replace(
  "function translateValue(value: string): string {",
  () => "function translateValue(value: string, language: Language): string {\n" +
  "  const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa }\n" +
  "  const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa }\n"
);
newContent = newContent.replace(
  "  const exact = exactEn[normalized]",
  () => "  const exact = exactMaps[language]?.[normalized]"
);
newContent = newContent.replace(
  "  for (const [pattern, replacement] of replacements) {",
  () => "  const currentReplacements = replMaps[language] || []\n" +
  "  for (const [pattern, replacement] of currentReplacements) {"
);
newContent = newContent.replace(
  "const next = translateValue(original)",
  () => "const next = translateValue(original, language)"
);
newContent = newContent.replace(
  "  if (language === 'en') {\n    const observer",
  () => "  if (language !== 'ru') {\n    const observer"
);

fs.writeFileSync('src/i18n/runtimeTranslations.ts', newContent, 'utf8');
console.log("SUCCESSfully patched runtime translations");
