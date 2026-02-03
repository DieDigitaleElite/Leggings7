
import React, { useState, useCallback, useEffect } from 'react';
import { Product, TryOnState } from './types';
import { MOCK_PRODUCTS, AVAILABLE_SIZES } from './constants';
import { performVirtualTryOn, fileToBase64, urlToBase64, estimateSizeFromImage } from './services/geminiService';
import ProductCard from './components/ProductCard';
import StepIndicator from './components/StepIndicator';

const App: React.FC = () => {
  const [state, setState] = useState<TryOnState>({
    userImage: null,
    selectedProduct: null,
    resultImage: null,
    recommendedSize: null,
    isLoading: false,
    error: null,
  });

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [step, setStep] = useState(1);

  // Initialer Check ob ein API Key vorhanden ist (Voraussetzung für Pro Modelle)
  useEffect(() => {
    const checkKey = async () => {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    await window.aistudio.openSelectKey();
    // Nach dem Dialog nehmen wir an, dass ein Key gewählt wurde (Race-Condition Handling laut Rules)
    setHasKey(true);
  };

  const handleProductSelect = useCallback((product: Product) => {
    setState(prev => ({ ...prev, selectedProduct: product }));
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setState(prev => ({ ...prev, userImage: base64, error: null }));
      } catch (err) {
        setState(prev => ({ ...prev, error: "Fehler beim Lesen der Bilddatei." }));
      }
    }
  }, []);

  const handleDownload = () => {
    if (!state.resultImage) return;
    const link = document.createElement('a');
    link.href = state.resultImage;
    link.download = `my-better-future-look.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTryOn = async () => {
    if (!state.userImage || !state.selectedProduct) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setStep(3);

    try {
      setLoadingStep('Lade High-End-Modell...');
      const productBase64 = await urlToBase64(state.selectedProduct.imageUrl);
      
      setLoadingStep('Analysiere Proportionen...');
      const aiRecommendedSize = await estimateSizeFromImage(state.userImage, state.selectedProduct.name);

      await new Promise(r => setTimeout(r, 1000));

      setLoadingStep('Generiere Foto-Realismus...');
      const result = await performVirtualTryOn(state.userImage, productBase64, state.selectedProduct);
      
      setState(prev => ({ 
        ...prev, 
        resultImage: result, 
        recommendedSize: aiRecommendedSize,
        isLoading: false 
      }));
    } catch (err: any) {
      console.error(err);
      if (err.message === "KEY_NOT_FOUND") {
        setHasKey(false);
        setState(prev => ({ ...prev, isLoading: false, error: "Bitte wähle deinen API Key erneut aus." }));
      } else {
        let msg = err.message || "Ein technischer Fehler ist aufgetreten.";
        if (msg.includes("429")) msg = "Die KI ist gerade ausgelastet. Bitte warte einen Moment.";
        setState(prev => ({ ...prev, isLoading: false, error: msg }));
      }
    }
  };

  const reset = () => {
    setState({ userImage: null, selectedProduct: null, resultImage: null, recommendedSize: null, isLoading: false, error: null });
    setLoadingStep('');
    setStep(1);
  };

  // Falls kein Key ausgewählt wurde, Setup-Screen anzeigen
  if (hasKey === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-[40px] p-10 shadow-2xl text-center border border-indigo-50">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3">
            <span className="text-white font-black text-3xl">B</span>
          </div>
          <h1 className="text-2xl font-black mb-4 uppercase tracking-tighter italic">Willkommen bei Better Future AI</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Um unseren hochauflösenden <b>Virtual Try-On</b> zu nutzen, musst du einmalig deinen API Key autorisieren. Dies stellt sicher, dass die Bildqualität perfekt ist.
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
          >
            START KONFIGURIEREN
          </button>
          <p className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Erfordert einen Key von <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">ai.google.dev</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10 bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-gray-200 py-4 mb-6 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="font-bold text-xl tracking-tight uppercase">Better Future <span className="font-light text-gray-500">PRO</span></span>
          </div>
          <button onClick={reset} className="text-xs font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest transition-colors">Reset</button>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-5xl">
        <StepIndicator currentStep={step} />

        {step === 1 && (
          <div className="animate-fadeIn">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black mb-3 tracking-tighter italic">SELECT OUTFIT</h1>
              <p className="text-slate-500">Wähle dein Set für das High-Resolution Rendering.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto">
              {MOCK_PRODUCTS.map(product => (
                <ProductCard key={product.id} product={product} isSelected={state.selectedProduct?.id === product.id} onSelect={handleProductSelect} />
              ))}
            </div>
            <div className="flex justify-center">
              <button disabled={!state.selectedProduct} onClick={() => setStep(2)} className={`px-12 py-5 rounded-full font-black text-xl transition-all shadow-2xl ${state.selectedProduct ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>NÄCHSTER SCHRITT</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fadeIn max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black mb-3 italic">DEIN FOTO</h1>
              <p className="text-slate-500 italic">Für das Pro-Modell ist ein Ganzkörperfoto optimal.</p>
            </div>
            <div className="bg-white p-8 rounded-[40px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[400px] shadow-inner">
              {state.userImage ? (
                <div className="relative w-full max-w-xs animate-scaleIn">
                  <img src={state.userImage} alt="Vorschau" className="rounded-3xl shadow-2xl w-full h-[400px] object-cover border-4 border-white" />
                  <button onClick={() => setState(prev => ({ ...prev, userImage: null }))} className="absolute -top-3 -right-3 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </button>
                </div>
              ) : (
                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer group py-10">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4 transition-all group-hover:scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-slate-600 font-black uppercase tracking-widest text-sm">Foto wählen</p>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mt-10 justify-center">
              <button onClick={() => setStep(1)} className="px-10 py-4 rounded-full font-black text-slate-400 bg-white border border-slate-200">Zurück</button>
              <button disabled={!state.userImage} onClick={handleTryOn} className={`px-12 py-4 rounded-full font-black text-lg transition-all shadow-xl ${state.userImage ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>ANPROBE STARTEN ✨</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fadeIn max-w-5xl mx-auto">
            {state.isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-8 shadow-xl"></div>
                <h2 className="text-3xl font-black text-slate-900 mb-2 italic uppercase tracking-tighter">{loadingStep}</h2>
                <p className="text-slate-400 text-sm">Pro-Engine berechnet jeden Pixel...</p>
              </div>
            ) : state.error ? (
              <div className="bg-white border-2 border-red-100 rounded-[40px] p-12 text-center shadow-2xl">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
                <h2 className="text-2xl font-black mb-4">FEHLER BEI DER VERARBEITUNG</h2>
                <p className="text-red-700 font-bold mb-8 italic">{state.error}</p>
                <div className="flex gap-4 justify-center">
                  <button onClick={handleTryOn} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-black shadow-xl hover:bg-indigo-700">Nochmal</button>
                  <button onClick={reset} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-full font-black">Zurück</button>
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-10 items-start">
                <div className="space-y-6">
                  <div className="relative group overflow-hidden rounded-[40px] bg-white p-1 shadow-2xl border border-slate-100">
                    <img src={state.resultImage!} alt="Ergebnis" className="w-full rounded-[38px]" />
                    <div className="absolute top-6 left-6">
                      <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">High-Res Render</div>
                    </div>
                  </div>
                  <button onClick={handleDownload} className="w-full bg-white text-slate-900 border border-slate-200 py-4 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all flex items-center justify-center space-x-2 shadow-sm uppercase tracking-widest">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span>LOOK SPEICHERN</span>
                  </button>
                </div>

                <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-100 flex flex-col">
                  <div className="mb-6 pb-6 border-b border-slate-100">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">DEIN NEUES SET</span>
                    <h2 className="text-4xl font-black mt-1 tracking-tighter italic uppercase">{state.selectedProduct?.name}</h2>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 mb-8 flex items-center space-x-5">
                    <div className="bg-emerald-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-lg">{state.recommendedSize}</div>
                    <div>
                      <p className="font-black text-emerald-900 text-lg uppercase tracking-tight">Deine Empfehlung</p>
                      <p className="text-xs font-bold text-emerald-700/70 italic uppercase tracking-widest">Perfekte Passform garantiert</p>
                    </div>
                  </div>

                  <p className="text-slate-500 mb-8 leading-relaxed font-medium italic">{state.selectedProduct?.description}</p>

                  <div className="mt-auto space-y-4">
                    <button onClick={() => window.open('https://superbeautiful.de', '_blank')} className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black text-xl hover:bg-indigo-700 transition-all shadow-xl uppercase tracking-widest flex items-center justify-center space-x-3">
                      <span>ZUM SHOP</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                    <button onClick={reset} className="w-full text-slate-400 py-2 font-black hover:text-indigo-600 transition-colors uppercase tracking-[0.3em] text-[10px]">Anderes Set wählen</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-20 border-t border-slate-100 pt-10 text-center">
        <p className="text-slate-300 text-[10px] uppercase tracking-[0.4em] font-black">Better Future AI Engine v3.0 • High Fidelity Release</p>
      </footer>

      <style>{`
        .animate-scaleIn { animation: scaleIn 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default App;
