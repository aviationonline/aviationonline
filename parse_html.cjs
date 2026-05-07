const cheerio = require('cheerio');
const fs = require('fs');

async function run() {
  const html = await fetch('https://aviationonline.fr/temoignages-formation-pilotes').then(r => r.text());
  const $ = cheerio.load(html);
  
  const testimonials = [];
  
  // Let's find all paragraphs that contain quotes or are followed by a paragraph with an author.
  // Actually, looking at the site, they might be in specific div containers.
  // Let's just print the classes of divs that contain text.
  const classes = new Set();
  $('div').each((i, el) => {
    const cls = $(el).attr('class');
    if (cls) classes.add(cls);
  });
  console.log(Array.from(classes).slice(0, 10));
}
run();
