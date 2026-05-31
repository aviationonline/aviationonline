import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function translateTestimonials() {
  const filePath = path.join(__dirname, 'src/data/testimonials.ts');
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract the array using a regex or just parse it if we strip the export
  const arrayString = content.replace('export const defaultTestimonials = ', '').replace(/;$/, '');
  
  let testimonials;
  try {
    // It's a JS object, not strict JSON. Let's use eval or Function
    testimonials = new Function('return ' + arrayString)();
  } catch (e) {
    console.error("Failed to parse testimonials", e);
    return;
  }

  console.log(`Found ${testimonials.length} testimonials.`);
  
  const batchSize = 10;
  for (let i = 0; i < testimonials.length; i += batchSize) {
    const batch = testimonials.slice(i, i + batchSize);
    const toTranslate = batch.map((t, idx) => ({
      index: i + idx,
      text: t.text,
      role: t.role
    }));

    console.log(`Translating batch ${i} to ${i + batchSize - 1}...`);
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview",
      contents: `Translate the following testimonials from French to English. Return a JSON array of objects with "text_en" and "role_en".\n\n${JSON.stringify(toTranslate)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text_en: { type: Type.STRING },
              role_en: { type: Type.STRING }
            }
          }
        }
      }
    });

    try {
      const translations = JSON.parse(response.text);
      for (let j = 0; j < translations.length; j++) {
        testimonials[i + j].text_en = translations[j].text_en;
        testimonials[i + j].role_en = translations[j].role_en;
      }
    } catch (e) {
      console.error("Failed to parse translation response", e);
    }
  }

  const newContent = `export const defaultTestimonials = ${JSON.stringify(testimonials, null, 2)};\n`;
  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log("Done translating testimonials.");
}

translateTestimonials();
