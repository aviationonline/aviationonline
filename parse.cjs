const fs = require('fs');

const paragraphs = JSON.parse(fs.readFileSync('paragraphs.json', 'utf8'));

const testimonials = [];
let currentText = [];

for (let i = 1; i < paragraphs.length; i++) {
  let p = paragraphs[i].trim();
  
  if (p === "Formation en ligne pour pilotes IFR et MCC.") break;

  currentText.push(p);
  
  if (p.endsWith('"') || p.endsWith('»') || p.endsWith("''")) {
    let authorRole = paragraphs[i+1] ? paragraphs[i+1].trim() : "";
    
    if (authorRole && !authorRole.startsWith('"') && !authorRole.startsWith('«')) {
      testimonials.push({ text: currentText.join('\n'), authorRole });
      currentText = [];
      i++; // skip author
    }
  }
}

const cleanTestimonials = testimonials.map((t, index) => {
  let text = t.text.replace(/^["«'']\s*/, '').replace(/\s*["»'']$/, '').trim();
  
  let authorRole = t.authorRole;
  let author = authorRole;
  let role = "";
  
  const parts = authorRole.split(/(CDB|OPL|Captain|FI|Senior|Pilote|MD|CdB|LTC|FO)/i);
  if (parts.length > 1) {
    author = parts[0].trim();
    role = parts.slice(1).join('').trim();
  } else {
    const match = authorRole.match(/^([A-Z][a-zà-ÿ]+(?:\s+[A-Z][A-Zà-ÿa-z]+)*)(.*)$/);
    if (match && match[2].length > 0) {
      author = match[1].trim();
      role = match[2].trim();
    }
  }
  
  return {
    text,
    author,
    role,
    rating: 5,
    order: index + 1
  };
});

fs.writeFileSync('parsed.json', JSON.stringify(cleanTestimonials, null, 2));
console.log("Parsed", cleanTestimonials.length, "testimonials");
