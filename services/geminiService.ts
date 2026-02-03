
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";

function getMimeType(dataUrl: string): string {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    return match ? match[1] : "image/png";
  }
  return "image/png";
}

function getCleanBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

export async function performVirtualTryOn(userBase64: string, productBase64: string, productName: string): Promise<string> {
  const userMimeType = getMimeType(userBase64);
  const productMimeType = getMimeType(productBase64);
  
  const cleanUserBase64 = getCleanBase64(userBase64);
  const cleanProductBase64 = getCleanBase64(productBase64);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Maximal restriktiver Prompt für absolute Design-Treue
  const promptText = `
    CRITICAL TASK: Absolute High-Fidelity Virtual Try-On.
    
    PRODUCT IDENTIFICATION: The product to apply is "${productName}" from the second image.
    
    STRICT DESIGN CONSTRAINTS (ZERO HALLUCINATION POLICY):
    1. NO ADDITIONS: Do NOT add pockets, zippers, buttons, drawstrings, or logos that are not clearly visible in the product image. If the product is seamless/clean, the output MUST be seamless/clean.
    2. SEAM ACCURACY: Replicate the exact seam lines, waist band height, and stitching patterns shown in the product image.
    3. FABRIC INTEGRITY: The texture, opacity, and color saturation must match the product image exactly. 
    4. ANATOMICAL FIT: The clothing must fit the person in the first image perfectly like a second skin, following their leg and torso shape without distorting the product's design.
    
    PRESERVATION RULES:
    - Keep the user's face, hair, hands, feet, and original background 100% identical.
    - Only replace the clothing. Ensure a clean transition at the waist, neck, and ankles.
    
    FINAL CHECK: Compare your generated outfit to the product image. They must be identical in structure and features.
    
    OUTPUT:
    Return ONLY the image. No textual response.
  `;

  try {
    const response = await ai.models.generateContent({
      model: APP_CONFIG.MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { data: cleanUserBase64, mimeType: userMimeType } },
          { inlineData: { data: cleanProductBase64, mimeType: productMimeType } },
          { text: promptText },
        ],
      },
      config: {
        temperature: 0.1, // Minimum temperature to ensure consistent, non-creative reproduction
      }
    });

    if (!response || !response.candidates || response.candidates.length === 0) {
      throw new Error("Die KI hat keine Antwort geliefert.");
    }

    const candidate = response.candidates[0];
    
    if (candidate.finishReason) {
      if (candidate.finishReason === 'SAFETY') {
        throw new Error("Das Foto wurde blockiert. Bitte nutze ein Bild mit neutralerer Pose.");
      } else if (candidate.finishReason === 'OTHER' || (candidate.finishReason as string) === 'IMAGE_OTHER') {
        throw new Error("Die KI konnte das Bild aufgrund technischer Einschränkungen nicht bearbeiten.");
      }
    }

    if (!candidate.content || !candidate.content.parts) {
      throw new Error("Ungültige Antwortstruktur der KI.");
    }

    let generatedImageUrl: string | null = null;
    for (const part of candidate.content.parts) {
      if (part.inlineData && part.inlineData.data) {
        generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!generatedImageUrl) {
      // Try using response.text as per instructions if no inline data is found
      const text = response.text;
      if (text) {
        throw new Error(`KI-Feedback: ${text}`);
      }
      throw new Error("Kein Bild generiert. Bitte anderes Foto versuchen.");
    }

    return generatedImageUrl;
  } catch (error: any) {
    console.error("Gemini Try-On Detail Error:", error);
    
    const errorMessage = error.message || "";
    if (errorMessage.includes("IMAGE_OTHER") || errorMessage.includes("OTHER")) {
      throw new Error("Das Bild konnte nicht generiert werden. Bitte nutze ein schärferes Foto mit weniger Falten in der Kleidung.");
    }
    
    throw new Error(error.message || "Fehler bei der Anprobe.");
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

export async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas Fail");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(new Error(`Fehler bei Bildverarbeitung.`));
      }
    };
    img.onerror = () => reject(new Error(`Produktbild konnte nicht geladen werden.`));
    img.src = proxiedUrl;
  });
}
