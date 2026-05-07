import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { defaultTestimonials } from './src/data/testimonials';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function translate() {
  const translated = [];
  for (let i = 0; i < defaultTestimonials.length; i++) {
    const t = defaultTestimonials[i];
    console.log(`Translating ${i + 1}/${defaultTestimonials.length}...`);
    try {
      const resText = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate the following French text to English. Return ONLY the English translation, no markdown, no quotes.\n\n${t.text}`
      });
      const resRole = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate the following French job title/role to English. Return ONLY the English translation, no markdown, no quotes.\n\n${t.role}`
      });
      
      translated.push({
        ...t,
        text_en: resText.text.trim(),
        role_en: resRole.text.trim()
      });
    } catch (e) {
      console.error(e);
      translated.push(t);
    }
  }
  
  const fileContent = `export const defaultTestimonials = ${JSON.stringify(translated, null, 2)};\n`;
  fs.writeFileSync('./src/data/testimonials.ts', fileContent);
  console.log('Done!');
}

translate();
