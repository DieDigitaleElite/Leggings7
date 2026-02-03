
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";
import { Product } from "../types";

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || "";
    // Falls der Key nicht gefunden wurde (Requested entity not found), zwingen wir den User zur Neuauswahl
    if (errorMsg.includes("Requested entity was not found")) {
      throw new Error("KEY_NOT_FOUND");
    }
    const isRetryable = errorMsg.includes("429") || error.status === 429;
    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

async function optimizeImage(base64: string, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas failure"));
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
  });
}

function getCleanBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

export async function estimateSizeFromImage(userBase64: string, productName: string): Promise<string> {
  return fetchWithRetry(async () => {
    const optimized = await optimizeImage(userBase64, 800);
    // Initialisierung direkt vor dem Call für aktuellsten API-Key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: APP_CONFIG.TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optimized), mimeType: "image/jpeg" } },
          { text: `Analyse the person's body type. Suggest a size (XS, S, M, L, XL, XXL) for the garment "${productName}". Output only the size code.` },
        ],
      },
    });
    const size = response.text?.trim().toUpperCase() || 'M';
    const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    return validSizes.find(s => size.includes(s)) || 'M';
  });
}

export async function performVirtualTryOn(userBase64: string, productBase64: string, product: Product): Promise<string> {
  return fetchWithRetry(async () => {
    const optUser = await optimizeImage(userBase64, 1024);
    const optProduct = await optimizeImage(productBase64, 1024);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Maximale Präzision für das Pro-Modell
    const promptText = `
      MANDATORY TASK: Perform a professional virtual fashion try-on.
      USER PHOTO: Image 1.
      PRODUCT PHOTO: Image 2.
      
      PRODUCT INFO: This is a TWO-PIECE SET consisting of a Top/Bra and Leggings.
      DETAILS: ${product.description}.
      
      RULES:
      1. You MUST render the person in Image 1 wearing BOTH parts of the set from Image 2.
      2. The leggings MUST be full-length and clearly visible.
      3. Maintain the EXACT colors, seam lines, and material texture from Image 2.
      4. Keep the person's face, hair, and original background from Image 1 100% identical.
      5. The outfit must fit tightly and realistically to the person's body.
      6. Return ONLY the final high-resolution image.
    `;

    const response = await ai.models.generateContent({
      model: APP_CONFIG.IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optUser), mimeType: "image/jpeg" } },
          { inlineData: { data: getCleanBase64(optProduct), mimeType: "image/jpeg" } },
          { text: promptText },
        ],
      },
      config: { 
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" }
      }
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error("Das Bild wurde aus Sicherheitsgründen blockiert. Bitte trage auf deinem Foto neutrale Kleidung.");
    }

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData?.data) return `data:image/jpeg;base64,${part.inlineData.data}`;
    throw new Error("KI konnte kein Bild generieren. Bitte versuche es mit einem deutlicheren Foto.");
  });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas fail"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error("Produktbild Fehler"));
    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1024&output=jpg`;
  });
}
