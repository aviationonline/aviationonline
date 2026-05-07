const fs = require('fs');

const paragraphs = JSON.parse(fs.readFileSync('paragraphs.json', 'utf8'));

const authorIndices = new Set([
  4, 21, 22, 24, 26, 28, 34, 35, 37, 39, 41, 43, 47, 49, 51, 53, 56, 59, 61, 65, 67, 70, 72, 76, 78, 80, 82, 84, 87, 92, 95, 98, 100, 102, 106, 108, 110, 112, 114, 116, 120, 122, 124, 126, 130, 132, 134, 138, 143, 145, 147, 150, 152, 154, 156, 158, 161, 162, 163, 165, 168, 170, 171, 173, 174
]);

const testimonials = [];
let currentText = [];
let currentAuthor = [];

for (let i = 1; i < paragraphs.length; i++) {
  let p = paragraphs[i].trim();
  
  if (i >= 175) break; // Stop at footer

  if (authorIndices.has(i)) {
    currentAuthor.push(p);
    
    // If the next line is NOT an author line, we've finished this testimonial block
    if (!authorIndices.has(i + 1)) {
      testimonials.push({
        text: currentText.join('\n'),
        authorRole: currentAuthor.join(' ')
      });
      currentText = [];
      currentAuthor = [];
    }
  } else {
    currentText.push(p);
  }
}

const cleanTestimonials = testimonials.map((t, index) => {
  let text = t.text.replace(/^["«'']\s*/, '').replace(/\s*["»'']$/, '').trim();
  
  let authorRole = t.authorRole;
  let author = authorRole;
  let role = "";
  
  const parts = authorRole.split(/(CDB|OPL|Captain|FI-CRI|FI\b|Senior|Pilote|Copilote|MD, PhD|CdB|LTC|\bFO\b|TRI|TRE|Associé-Gérant|RDFE|Pilot instructor)/i);
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

fs.writeFileSync('parsed_final.json', JSON.stringify(cleanTestimonials, null, 2));
console.log("Parsed", cleanTestimonials.length, "testimonials");
