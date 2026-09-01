import fs from 'fs';
import translate from 'google-translate-api-x';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
  const content = fs.readFileSync('src/i18n/runtimeTranslations.ts', 'utf8');

  const exactEnMatch = content.match(/const exactEn: Record<string, string> = \{([\s\S]+?)\}\r?\n\r?\nconst replacements/);
  const replacementsMatch = content.match(/const replacements: Array<\[RegExp, string\]> = \[([\s\S]+?)\]\r?\n\r?\nconst textOriginals/);

  const exactEnBlock = exactEnMatch![1];
  const replacementsBlock = replacementsMatch![1];

  async function translateDictBlock(block: string) {
    const lines = block.split('\n');
    const batchLines: any[] = [];
    const batchKeys: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(':') && !line.trim().startsWith('//')) {
        const match = line.match(/^(\s*)(?:(?:'([^']+)')|(?:"([^"]+)")|([A-Za-z0-9_]+))(\s*:\s*)(?:(?:'([^']+)')|(?:"([^"]+)"))(.*)$/);
        if (match) {
          const key = match[2] || match[3] || match[4];
          batchLines.push({ i, indent: match[1], key, colon: match[5], rest: match[8], sourceText: key });
          batchKeys.push(key);
        }
      }
    }
    
    const translatedVals: string[] = [];
    for (let i = 0; i < batchKeys.length; i += 50) {
      const chunk = batchKeys.slice(i, i + 50);
      try {
        const res = await translate(chunk, { from: 'ru', to: 'ka' });
        if (Array.isArray(res)) translatedVals.push(...res.map(r => r.text));
        else translatedVals.push(res.text);
      } catch (err) {
        for (const str of chunk) {
          await delay(200);
          try {
            const res = await translate(str, { from: 'ru', to: 'ka' });
            translatedVals.push(res.text);
          } catch {
            translatedVals.push(str);
          }
        }
      }
      await delay(500);
    }
    
    const outLines = [...lines];
    for (let idx = 0; idx < batchLines.length; idx++) {
      const { i, indent, key, colon, rest, sourceText } = batchLines[idx];
      let tVal = idx < translatedVals.length ? translatedVals[idx] : sourceText;
      tVal = tVal.replace(/'/g, "\\'");
      const kStr = (key.includes(' ') || key.includes('-') || key.includes('.')) ? `'${key}'` : key;
      outLines[i] = `${indent}${kStr}${colon}'${tVal}'${rest}`;
    }
    return outLines.join('\n');
  }

  async function translateReplBlock(block: string) {
    const lines = block.split('\n');
    const batchLines: any[] = [];
    const batchKeys: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(',') && !line.trim().startsWith('//') && line.includes(']')) {
        const match = line.match(/^(\s*\[.*,\s*)(?:'([^']+)'|"(.*)")(\],?)$/);
        if (match) {
          const val = match[2] || match[3];
          batchLines.push({ i, prefix: match[1], suffix: match[4], val });
          batchKeys.push(val);
        }
      }
    }
    
    const translatedVals: string[] = [];
    for (let i = 0; i < batchKeys.length; i += 50) {
      const chunk = batchKeys.slice(i, i + 50);
      try {
        const res = await translate(chunk, { from: 'en', to: 'ka' });
        if (Array.isArray(res)) translatedVals.push(...res.map(r => r.text));
        else translatedVals.push(res.text);
      } catch (err) {
        for (const str of chunk) {
          await delay(200);
          try {
            const res = await translate(str, { from: 'en', to: 'ka' });
            translatedVals.push(res.text);
          } catch {
            translatedVals.push(str);
          }
        }
      }
      await delay(500);
    }
    
    const outLines = [...lines];
    for (let idx = 0; idx < batchLines.length; idx++) {
      const { i, prefix, suffix, val } = batchLines[idx];
      let tVal = idx < translatedVals.length ? translatedVals[idx] : val;
      tVal = tVal.replace(/\$\s*(\d)/g, '$$$1');
      tVal = tVal.replace(/'/g, "\\'");
      outLines[i] = `${prefix}'${tVal}'${suffix}`;
    }
    return outLines.join('\n');
  }

  const ek = await translateDictBlock(exactEnBlock);
  const rk = await translateReplBlock(replacementsBlock);
  
  const outExact = `const exactKa: Record<string, string> = {${ek}}\n`;
  const outRepl = `const replacementsKa: Array<[RegExp, string]> = [${rk}]\n`;
  
  let newContent = content;
  newContent = newContent.replace(
    exactEnMatch[0],
    `const exactEn: Record<string, string> = {${exactEnBlock}}\n\n${outExact}\nconst replacements`
  );
  newContent = newContent.replace(
    replacementsMatch[0],
    `const replacements: Array<[RegExp, string]> = [${replacementsBlock}]\n\n${outRepl}\nconst textOriginals`
  );
  newContent = newContent.replace(
    "function translateValue(value: string): string {",
    "function translateValue(value: string, language: Language): string {\n" +
    "  const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa }\n" +
    "  const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa }\n"
  );
  newContent = newContent.replace(
    "  const exact = exactEn[normalized]",
    "  const exact = exactMaps[language]?.[normalized]"
  );
  newContent = newContent.replace(
    "  for (const [pattern, replacement] of replacements) {",
    "  const currentReplacements = replMaps[language] || []\n" +
    "  for (const [pattern, replacement] of currentReplacements) {"
  );
  newContent = newContent.replace(
    "const next = translateValue(original)",
    "const next = translateValue(original, language)"
  );
  newContent = newContent.replace(
    "  if (language === 'en') {\n    const observer",
    "  if (language !== 'ru') {\n    const observer"
  );
  
  fs.writeFileSync('src/i18n/runtimeTranslations.ts', newContent, 'utf8');
  console.log("Finished patching runtimeTranslations.ts");
}

main().catch(console.error);
