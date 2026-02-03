
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";
import { Product } from "../types";

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error.message?.includes("429") || error.status === 429 || error.message?.includes("quota");
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: APP_CONFIG.TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optimized), mimeType: "image/jpeg" } },
          { text: `Analyse the person. Suggest a size (XS, S, M, L, XL, XXL) for "${productName}". Output only the size code.` },
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
    
    const promptText = `
      MANDATORY TASK: Professional Virtual Try-On for a Fashion Store.
      USER: Image 1. PRODUCT: Image 2.
      PRODUCT DESCRIPTION: ${product.description}.
      
      CRITICAL INSTRUCTIONS:
      1. This is a TWO-PIECE SET. You MUST dress the person in BOTH the top and the full-length leggings shown in Image 2.
      2. Do NOT omit the pants/leggings. Ensure the full outfit is visible.
      3. STICK EXACTLY to the color, fabric sheen, and distinctive seam patterns of the product.
      4. Maintain the person's identity (face, hair) and the background of Image 1 perfectly.
      5. The fit should be tight and athletic. Output ONLY the image.
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
      config: { temperature: 0 }
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error("Bild blockiert. Bitte wähle ein Foto mit neutraler Kleidung.");
    }

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData?.data) return `data:image/jpeg;base64,${part.inlineData.data}`;
    throw new Error("KI-Fehler. Bitte versuche es mit einem Ganzkörperfoto.");
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
