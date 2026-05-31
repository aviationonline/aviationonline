import * as cheerio from 'cheerio';
import fs from 'fs';

async function run() {
  const html = await fetch('https://aviationonline.fr/temoignages-formation-pilotes').then(r => r.text());
  const $ = cheerio.load(html);
  
  const paragraphs = $('p').map((i, el) => $(el).text().trim()).get().filter(t => t.length > 0);
  
  fs.writeFileSync('paragraphs.json', JSON.stringify(paragraphs, null, 2));
}
run();
