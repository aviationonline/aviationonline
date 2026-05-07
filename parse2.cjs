const fs = require('fs');

const paragraphs = JSON.parse(fs.readFileSync('paragraphs.json', 'utf8'));

const testimonials = [];
let currentText = [];

for (let i = 1; i < paragraphs.length; i++) {
  let p = paragraphs[i].trim();
  
  if (p === "Formation en ligne pour pilotes IFR et MCC.") break;

  // Check if this paragraph looks like an author line
  // Author lines are usually short, don't end with a period (unless it's an ellipsis or something, but usually not),
  // and often contain roles like OPL, CDB, Captain, FI, etc., OR the next paragraph starts with a quote.
  
  let isAuthor = false;
  let authorRole = p;
  
  // If it's a known author line from our manual inspection
  if (p.includes("Maxime Laudat") || 
      p.includes("Falk WINKLER") || 
      p.includes("Captain A220 Air France") ||
      p.includes("Frédéric Echassoux") ||
      p.includes("Hamza Hadded") ||
      p.includes("Harold Vernoux") ||
      p.includes("Damien Daroussi") ||
      p.includes("OPL ATR 72") ||
      p.includes("Guillaume Carré") ||
      p.includes("Anthony Robert") ||
      p.includes("Adrien Joseph") ||
      p.includes("Jean-Baptiste Issanchou") ||
      p.includes("Jérome Labarthe") ||
      p.includes("OlivierCdB") ||
      p.includes("Tanguy Doucerain") ||
      p.includes("Régis Fuzier") ||
      p.includes("Didier Aucoin") ||
      p.includes("Roarii Chavez") ||
      p.includes("Nicolas L.") ||
      p.match(/(CDB|OPL|Captain|FI|Senior|Pilote|MD|CdB|LTC|FO|TRI|TRE)\b/i) && p.length < 100 && !p.startsWith('"') && !p.startsWith('«')
     ) {
    
    // Wait, "Nicolas L." is in the text of a testimonial: "(avec mon binôme Nicolas L.)"
    if (!p.startsWith('"') && !p.startsWith('«') && p.length < 100 && !p.endsWith('.')) {
        isAuthor = true;
    }
  }

  // A more robust way:
  // An author line is usually followed by a paragraph starting with a quote, 
  // OR it's preceded by a paragraph ending with a quote.
  // Let's just use a regex for roles, and check length.
  const roleRegex = /(CDB|OPL|Captain|FI-CRI|FI\b|Senior|Pilote|MD, PhD|CdB|LTC|FO|TRI|TRE)/i;
  
  if (!isAuthor && p.length < 100 && !p.startsWith('"') && !p.startsWith('«')) {
    if (roleRegex.test(p)) {
      isAuthor = true;
    } else if (paragraphs[i+1] && (paragraphs[i+1].trim().startsWith('"') || paragraphs[i+1].trim().startsWith('«'))) {
      // If the next paragraph starts with a quote, this might be an author line.
      // But wait, what if it's "Aéronautiquement,"? We should include it in the text, or ignore it.
      if (p !== "Aéronautiquement,") {
        isAuthor = true;
      }
    }
  }

  // Special case for Falk Winkler which is split in two
  if (p === "Falk WINKLER") isAuthor = true;
  if (p === "Captain A220 Air France") isAuthor = true;
  if (p === "Damien Daroussi") isAuthor = true;
  if (p === "OPL ATR 72 - EWA Air") isAuthor = true;

  if (isAuthor) {
    // If we have accumulated text, save the testimonial
    if (currentText.length > 0) {
      // Wait, if the previous line was also an author (like Falk Winkler), we should combine them
      if (testimonials.length > 0 && currentText.length === 0) {
         testimonials[testimonials.length - 1].authorRole += " " + p;
      } else {
         testimonials.push({ text: currentText.join('\n'), authorRole: p });
         currentText = [];
      }
    } else if (testimonials.length > 0) {
      testimonials[testimonials.length - 1].authorRole += " " + p;
    }
  } else {
    currentText.push(p);
  }
}

// If there's leftover text, it might be a testimonial without an author, or we missed the author.
if (currentText.length > 0) {
  testimonials.push({ text: currentText.join('\n'), authorRole: "Anonyme" });
}

const cleanTestimonials = testimonials.map((t, index) => {
  let text = t.text.replace(/^["«'']\s*/, '').replace(/\s*["»'']$/, '').trim();
  
  let authorRole = t.authorRole;
  let author = authorRole;
  let role = "";
  
  const parts = authorRole.split(/(CDB|OPL|Captain|FI-CRI|FI\b|Senior|Pilote|MD, PhD|CdB|LTC|FO|TRI|TRE)/i);
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

fs.writeFileSync('parsed2.json', JSON.stringify(cleanTestimonials, null, 2));
console.log("Parsed", cleanTestimonials.length, "testimonials");
