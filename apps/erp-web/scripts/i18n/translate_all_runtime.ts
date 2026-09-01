import fs from 'fs';
import translate from 'google-translate-api-x';
import { ru } from '../../src/i18n/dictionaries/ru';
import { es } from '../../src/i18n/dictionaries/es';
import { tr } from '../../src/i18n/dictionaries/tr';
import { ka } from '../../src/i18n/dictionaries/ka';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
  console.log('Starting comprehensive runtime translation...');

  // 1. Build dictionary map
  const staticMap = new Map<string, { es?: string, tr?: string, ka?: string }>();

  function traverseDict(ruObj: any, esObj: any, trObj: any, kaObj: any) {
    if (typeof ruObj === 'object' && ruObj !== null) {
      for (const k in ruObj) {
        traverseDict(
          ruObj[k],
          esObj ? esObj[k] : undefined,
          trObj ? trObj[k] : undefined,
          kaObj ? kaObj[k] : undefined
        );
      }
    } else if (typeof ruObj === 'string') {
      const normalizedRu = ruObj.trim(); 
      if (!staticMap.has(normalizedRu)) {
        staticMap.set(normalizedRu, {
          es: typeof esObj === 'string' ? esObj : undefined,
          tr: typeof trObj === 'string' ? trObj : undefined,
          ka: typeof kaObj === 'string' ? kaObj : undefined,
        });
      }
    }
  }

  traverseDict(ru, es, tr, ka);
  console.log(`Built static dictionary map with ${staticMap.size} entries.`);

  // 2. Read runtimeTranslations.ts
  const contentPath = 'src/i18n/runtimeTranslations.ts';
  const content = fs.readFileSync(contentPath, 'utf8');

  // FIX: Match only up to the next block
  const exactEnMatch = content.match(/const exactEn: Record<string, string> = \{([\s\S]*?)\}\r?\n\r?\nconst exactKa/);
  const replacementsMatch = content.match(/const replacements: Array<\[RegExp, string\]> = \[([\s\S]*?)\]\r?\n\r?\nconst replacementsKa/);

  if (!exactEnMatch || !replacementsMatch) {
    console.error("Could not find exactEn or replacements blocks.");
    process.exit(1);
  }

  const exactEnBlock = exactEnMatch[1];
  const replacementsBlock = replacementsMatch[1];

  async function translateExactBlock(langCode: 'es' | 'tr' | 'ka', block: string) {
    const cacheFile = `.translate_cache_exact_${langCode}.json`;
    let translatedVals: string[] = [];
    
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
    
    if (fs.existsSync(cacheFile)) {
      console.log(`[${langCode}] Loading exact block from cache...`);
      translatedVals = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      let toTranslateIndices: number[] = [];
      let toTranslateStrings: string[] = [];
      
      for (let i = 0; i < batchKeys.length; i++) {
        const ruKey = batchKeys[i];
        const normalizedRuKey = ruKey.replace(/\s+/g, ' ').trim();
        const mapped = staticMap.get(normalizedRuKey);
        
        let foundTranslation = mapped ? mapped[langCode] : undefined;
        if (foundTranslation && foundTranslation.trim() === normalizedRuKey && langCode !== 'ru') {
           foundTranslation = undefined; 
        }
        
        if (foundTranslation) {
          translatedVals[i] = foundTranslation;
        } else {
          toTranslateIndices.push(i);
          toTranslateStrings.push(ruKey);
        }
      }
      
      console.log(`[${langCode}] ${batchKeys.length - toTranslateIndices.length} resolved from static dict. ${toTranslateIndices.length} to translate via API.`);
      
      for (let i = 0; i < toTranslateStrings.length; i += 50) {
        const chunk = toTranslateStrings.slice(i, i + 50);
        const chunkIndices = toTranslateIndices.slice(i, i + 50);
        try {
          const res = await translate(chunk, { from: 'ru', to: langCode });
          if (Array.isArray(res)) {
             res.forEach((r, idx) => translatedVals[chunkIndices[idx]] = r.text);
          } else {
             translatedVals[chunkIndices[0]] = res.text;
          }
        } catch (err) {
          for (let j = 0; j < chunk.length; j++) {
            await delay(200);
            try {
              const res = await translate(chunk[j], { from: 'ru', to: langCode });
              translatedVals[chunkIndices[j]] = res.text;
            } catch {
              translatedVals[chunkIndices[j]] = chunk[j];
            }
          }
        }
        await delay(500);
        fs.writeFileSync(cacheFile, JSON.stringify(translatedVals), 'utf8');
      }
    }
    
    const outLines = [...lines];
    for (let idx = 0; idx < batchLines.length; idx++) {
      const { i, indent, key, colon, rest, sourceText } = batchLines[idx];
      let tVal = translatedVals[idx] || sourceText;
      if (tVal) {
        tVal = tVal.replace(/'/g, "\\'");
      } else {
        tVal = sourceText.replace(/'/g, "\\'");
      }
      const kStr = (key.includes(' ') || key.includes('-') || key.includes('.')) ? `'${key}'` : key;
      outLines[i] = `${indent}${kStr}${colon}'${tVal}'${rest}`;
    }
    return outLines.join('\n');
  }

  async function translateReplBlock(langCode: 'es' | 'tr' | 'ka', block: string) {
    const cacheFile = `.translate_cache_repl_${langCode}.json`;
    let translatedVals: string[] = [];
    
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
    
    if (fs.existsSync(cacheFile)) {
       console.log(`[${langCode}] Loading repl block from cache...`);
       translatedVals = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      for (let i = 0; i < batchKeys.length; i += 50) {
        const chunk = batchKeys.slice(i, i + 50);
        try {
          const res = await translate(chunk, { from: 'en', to: langCode });
          if (Array.isArray(res)) translatedVals.push(...res.map(r => r.text));
          else translatedVals.push(res.text);
        } catch (err) {
          for (const str of chunk) {
            await delay(200);
            try {
              const res = await translate(str, { from: 'en', to: langCode });
              translatedVals.push(res.text);
            } catch {
              translatedVals.push(str);
            }
          }
        }
        await delay(500);
        fs.writeFileSync(cacheFile, JSON.stringify(translatedVals), 'utf8');
      }
    }
    
    const outLines = [...lines];
    for (let idx = 0; idx < batchLines.length; idx++) {
      const { i, prefix, suffix, val } = batchLines[idx];
      let tVal = idx < translatedVals.length ? translatedVals[idx] : val;
      if (tVal) {
        tVal = tVal.replace(/\$\s*(\d)/g, '$$$1');
        tVal = tVal.replace(/'/g, "\\'");
      } else {
        tVal = val;
      }
      outLines[i] = `${prefix}'${tVal}'${suffix}`;
    }
    return outLines.join('\n');
  }

  const exactKaVal = await translateExactBlock('ka', exactEnBlock);
  const replKaVal = await translateReplBlock('ka', replacementsBlock);
  
  const exactEsVal = await translateExactBlock('es', exactEnBlock);
  const replEsVal = await translateReplBlock('es', replacementsBlock);

  const exactTrVal = await translateExactBlock('tr', exactEnBlock);
  const replTrVal = await translateReplBlock('tr', replacementsBlock);

  console.log('Patching runtimeTranslations.ts...');
  
  const outExactKa = `const exactKa: Record<string, string> = {${exactKaVal}}\n`;
  const outExactEs = `const exactEs: Record<string, string> = {${exactEsVal}}\n`;
  const outExactTr = `const exactTr: Record<string, string> = {${exactTrVal}}\n`;

  const outReplKa = `const replacementsKa: Array<[RegExp, string]> = [${replKaVal}]\n`;
  const outReplEs = `const replacementsEs: Array<[RegExp, string]> = [${replEsVal}]\n`;
  const outReplTr = `const replacementsTr: Array<[RegExp, string]> = [${replTrVal}]\n`;

  let newContent = content;

  function safeReplace(source: string, search: RegExp | string, replacement: string) {
    if (typeof search === 'string') {
      return source.split(search).join(replacement);
    } else {
      const match = source.match(search);
      if (match) {
         return source.substring(0, match.index) + replacement + source.substring(match.index! + match[0].length);
      }
      return source;
    }
  }

  // Find exactKa and replace it EXACTLY to the next block or empty line
  const regexExactKa = /const exactKa: Record<string, string> = \{[\s\S]*?\}\r?\n/;
  if (regexExactKa.test(newContent)) {
     newContent = safeReplace(newContent, regexExactKa, outExactKa);
  }

  const regexExactEs = /const exactEs: Record<string, string> = \{[\s\S]*?\}\r?\n/;
  if (regexExactEs.test(newContent)) {
     newContent = safeReplace(newContent, regexExactEs, outExactEs);
  }

  const regexExactTr = /const exactTr: Record<string, string> = \{[\s\S]*?\}\r?\n/;
  if (regexExactTr.test(newContent)) {
     newContent = safeReplace(newContent, regexExactTr, outExactTr);
  }

  const regexReplKa = /const replacementsKa: Array<\[RegExp, string\]> = \[[\s\S]*?\]\r?\n/;
  if (regexReplKa.test(newContent)) {
     newContent = safeReplace(newContent, regexReplKa, outReplKa);
  }

  const regexReplEs = /const replacementsEs: Array<\[RegExp, string\]> = \[[\s\S]*?\]\r?\n/;
  if (regexReplEs.test(newContent)) {
     newContent = safeReplace(newContent, regexReplEs, outReplEs);
  }

  const regexReplTr = /const replacementsTr: Array<\[RegExp, string\]> = \[[\s\S]*?\]\r?\n/;
  if (regexReplTr.test(newContent)) {
     newContent = safeReplace(newContent, regexReplTr, outReplTr);
  }

  newContent = safeReplace(
     newContent,
     /const exactMaps: Record<string, Record<string, string>> = \{.*?\}/,
     "const exactMaps: Record<string, Record<string, string>> = { en: exactEn, ka: exactKa, es: exactEs, tr: exactTr }"
  );
  newContent = safeReplace(
     newContent,
     /const replMaps: Record<string, \[RegExp, string\]\[\]> = \{.*?\}/,
     "const replMaps: Record<string, [RegExp, string][]> = { en: replacements, ka: replacementsKa, es: replacementsEs, tr: replacementsTr }"
  );

  fs.writeFileSync(contentPath, newContent, 'utf8');
  console.log("Finished patching runtimeTranslations.ts successfully!");
}

main().catch(console.error);
