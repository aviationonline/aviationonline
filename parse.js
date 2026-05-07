const fs = require('fs');

const paragraphs = JSON.parse(fs.readFileSync('paragraphs.json', 'utf8'));

const testimonials = [];
let currentText = [];
let inTestimonial = false;

for (let i = 1; i < paragraphs.length; i++) {
  let p = paragraphs[i].trim();
  
  if (p === "Formation en ligne pour pilotes IFR et MCC.") break;

  if (p.startsWith('"') || p.startsWith('«') || p.startsWith("''")) {
    inTestimonial = true;
    currentText = [p];
    
    // If it also ends with a quote, it's a single paragraph testimonial
    if ((p.endsWith('"') || p.endsWith('»') || p.endsWith("''")) && p.length > 2) {
      inTestimonial = false;
      let authorRole = paragraphs[i+1];
      if (authorRole && !authorRole.startsWith('"') && !authorRole.startsWith('«')) {
        testimonials.push({ text: currentText.join('\n'), authorRole });
        i++; // skip author
      } else {
        testimonials.push({ text: currentText.join('\n'), authorRole: "Unknown" });
      }
    }
  } else if (inTestimonial) {
    currentText.push(p);
    if (p.endsWith('"') || p.endsWith('»') || p.endsWith("''")) {
      inTestimonial = false;
      let authorRole = paragraphs[i+1];
      if (authorRole && !authorRole.startsWith('"') && !authorRole.startsWith('«')) {
        testimonials.push({ text: currentText.join('\n'), authorRole });
        i++; // skip author
      } else {
        testimonials.push({ text: currentText.join('\n'), authorRole: "Unknown" });
      }
    }
  } else {
    // Maybe an author role spanning multiple lines?
    if (testimonials.length > 0) {
      testimonials[testimonials.length - 1].authorRole += " " + p;
    }
  }
}

const cleanTestimonials = testimonials.map((t, index) => {
  let text = t.text.replace(/^["«'']\s*/, '').replace(/\s*["»'']$/, '').trim();
  
  let author = t.authorRole;
  let role = "";
  
  // Try to split author and role
  // e.g. "Maxime LaudatOPL Air France / Transavia" -> "Maxime Laudat", "OPL Air France / Transavia"
  // "Falk WINKLER Captain A220 Air France" -> "Falk WINKLER", "Captain A220 Air France"
  
  const match = author.match(/^([A-Z][a-zà-ÿ]+(?:\s+[A-Z][A-Zà-ÿa-z]+)*)(.*)$/);
  if (match && match[2].length > 0) {
    author = match[1].trim();
    role = match[2].trim();
  } else {
    // fallback splitting
    const parts = author.split(/(CDB|OPL|Captain|FI|Senior|Pilote|MD|CdB)/i);
    if (parts.length > 1) {
      author = parts[0].trim();
      role = parts.slice(1).join('').trim();
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
