import fs from 'fs';
import translate from 'google-translate-api-x';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
  const data = JSON.parse(fs.readFileSync('ru_dict.json', 'utf8'));

  const paths: string[][] = [];
  const strings: string[] = [];

  function traverse(node: any, path: string[]) {
    if (typeof node === 'object' && node !== null) {
      for (const k in node) {
        traverse(node[k], [...path, k]);
      }
    } else if (typeof node === 'string') {
      paths.push(path);
      strings.push(node);
    }
  }

  traverse(data, []);

  function protect(text: string) {
    let t = text.replace(/\{\{(.+?)\}\}/g, '<v>$1</v>');
    t = t.replace(/\{([^}]+)\}/g, '<v>$1</v>');
    return t;
  }

  function unprotect(text: string) {
    return text.replace(/<\s*v\s*>([^<]+)<\s*\/\s*v\s*>/g, '{$1}');
  }

  const protectedStrings = strings.map(protect);
  console.log(`Translating ${strings.length} strings to Georgian...`);

  const translatedStrings: string[] = [];
  
  // We'll translate in chunks of 50
  for (let i = 0; i < protectedStrings.length; i += 50) {
    const chunk = protectedStrings.slice(i, i + 50);
    console.log(`Translating chunk ${i} to ${i + chunk.length}...`);
    
    try {
      const res = await translate(chunk, { from: 'ru', to: 'tr' });
      if (Array.isArray(res)) {
        translatedStrings.push(...res.map(r => r.text));
      } else {
        translatedStrings.push(res.text); // shouldn't happen for array input
      }
    } catch (err: any) {
      console.error(`Chunk failed: ${err.message}. Retrying one by one...`);
      for (const str of chunk) {
        try {
          await delay(200);
          const res = await translate(str, { from: 'ru', to: 'tr' });
          translatedStrings.push(res.text);
        } catch (e) {
          translatedStrings.push(str);
        }
      }
    }
    await delay(1000);
  }

  const outData = JSON.parse(JSON.stringify(data));
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const origStr = strings[i];
    if (i < translatedStrings.length) {
      let transStr = unprotect(translatedStrings[i]);
      if (origStr.includes('{{')) {
         transStr = transStr.replace(/\{([^}]+)\}/g, '{{$1}}');
         transStr = transStr.replace(/\{\{\{\{/g, '{{').replace(/\}\}\}\}/g, '}}');
      }
      let node = outData;
      for (let j = 0; j < path.length - 1; j++) {
        node = node[path[j]];
      }
      node[path[path.length - 1]] = transStr;
    }
  }

  fs.writeFileSync('tr_dict.json', JSON.stringify(outData, null, 2), 'utf8');
  console.log('Finished tr_dict.json');
}

main().catch(console.error);
