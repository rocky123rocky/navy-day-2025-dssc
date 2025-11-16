
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { QRCodeSVG } from 'qrcode.react';

type AppState = 'welcome' | 'capturing' | 'processing' | 'result';

interface AnalysisResult {
  title: string;
  analysis: string;
}

// Helper function to convert base64 for API
const fileToGenerativePart = (base64Data: string, mimeType: string) => {
    return {
        inlineData: {
            data: base64Data.split(',')[1],
            mimeType
        }
    };
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return blob;
};


/**
 * Generates a single composite image by drawing the cartoon, title, and analysis onto a canvas.
 * @param base64Image The base64 data URL of the generated cartoon.
 * @param title The funny title for the character.
 * @param analysis The witty analysis text.
 * @returns A promise that resolves with the new composite image as a base64 data URL.
 */
const generateCompositeImage = (base64Image: string, title: string, analysis: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = base64Image;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context not available'));

            // Layout constants
            const padding = 50;
            const textGap = 25;
            const backgroundColor = '#FFFFFF';
            const titleFont = 'bold 48px sans-serif';
            const analysisFont = 'italic 28px sans-serif';
            const textColor = '#111827';

            // Calculate wrapped text height
            ctx.font = analysisFont;
            const words = analysis.split(' ');
            let line = '';
            const lines: string[] = [];
            const maxWidth = img.width - (padding * 2);

            for (const word of words) {
                const testLine = line + word + ' ';
                if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
                    lines.push(line.trim());
                    line = word + ' ';
                } else {
                    line = testLine;
                }
            }
            lines.push(line.trim());

            const titleHeight = 48;
            const analysisLineHeight = 36;
            const analysisHeight = lines.length * analysisLineHeight;
            const textBlockHeight = titleHeight + textGap + analysisHeight;
            
            canvas.width = img.width;
            canvas.height = img.height + textBlockHeight + padding * 2;

            // Draw elements to canvas
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            
            ctx.font = titleFont;
            ctx.fillText(title, canvas.width / 2, img.height + padding + titleHeight);

            ctx.font = analysisFont;
            let currentY = img.height + padding + titleHeight + textGap + analysisLineHeight;
            for (const l of lines) {
                ctx.fillText(l, canvas.width / 2, currentY);
                currentY += analysisLineHeight;
            }

            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => reject(new Error('Failed to load image for composition.'));
    });
};

/**
 * Resizes an image to a smaller dimension for use in QR codes.
 * @param base64Str The original image's base64 data URL.
 * @param maxWidth The maximum width of the output image.
 * @param maxHeight The maximum height of the output image.
 * @returns A promise that resolves with the new, smaller data URL.
 */
const resizeImage = (base64Str: string, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round(width * (maxHeight / height));
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas context'));
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = (err) => reject(new Error("Failed to load image for resizing."));
  });
};


// --- Sub-components defined outside the main component ---

const Spinner: React.FC = () => (
    <div className="border-4 border-t-4 border-gray-200 border-t-blue-500 rounded-full w-12 h-12 animate-spin"></div>
);

interface WebcamCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  width?: number;
  height?: number;
}

const WebcamCapture: React.FC<WebcamCaptureProps> = ({ onCapture, width = 640, height = 480 }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width, height } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setError("Could not access the camera. Please check permissions and try again.");
    }
  }, [width, height]);

  useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        onCapture(dataUrl);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-lg bg-black rounded-lg overflow-hidden shadow-lg border-2 border-blue-400">
        <video ref={videoRef} autoPlay playsInline className="w-full h-auto" muted />
        <div className="absolute inset-0 border-8 border-white/50 rounded-lg pointer-events-none opacity-50"></div>
        <canvas ref={canvasRef} width={width} height={height} className="hidden"></canvas>
      </div>
      {error && <p className="text-red-400 bg-red-900/50 p-2 rounded">{error}</p>}
      <button
        onClick={handleCapture}
        disabled={!!error}
        className="px-8 py-3 bg-yellow-500 text-gray-900 font-bold rounded-full hover:bg-yellow-400 transition-transform transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
      >
        Capture Photo
      </button>
    </div>
  );
};


const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('welcome');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [characterAnalysis, setCharacterAnalysis] = useState<AnalysisResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cleanup object URL to prevent memory leaks
    return () => {
        if (downloadUrl) {
            URL.revokeObjectURL(downloadUrl);
        }
    };
  }, [downloadUrl]);


  const handleCapture = async (imageDataUrl: string) => {
    setCapturedImage(imageDataUrl);
    setAppState('processing');
    setError(null);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const imagePart = fileToGenerativePart(imageDataUrl, "image/jpeg");

        // --- Step 1: Analyze image for person count and gender ---
        const personAnalysisResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [
                imagePart, 
                { text: `Analyze this photo and identify the number of people and their perceived gender(s). Respond in JSON. If there is one person, provide their gender. If there are two people, provide both genders.` }
            ]},
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        count: { type: Type.INTEGER, description: "The number of people in the photo (1 or 2)." },
                        genders: {
                            type: Type.ARRAY,
                            description: "An array of perceived genders ('male', 'female'). e.g., ['male'], ['female'], ['male', 'female']",
                            items: { type: Type.STRING }
                        }
                    },
                    required: ["count", "genders"]
                }
            }
        });

        let pronoun = 'their';
        try {
            const personData = JSON.parse(personAnalysisResponse.text);
            if (personData.count === 1) {
                if (personData.genders[0]?.toLowerCase() === 'male') {
                    pronoun = 'his';
                } else if (personData.genders[0]?.toLowerCase() === 'female') {
                    pronoun = 'her';
                }
            }
        } catch (e) {
            console.warn("Could not determine gender/count, defaulting to 'their'.");
        }
        
        // --- Step 2: Parallel API Calls for Image Generation and Text Analysis ---
        const imagePromise = ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    imagePart,
                    { text: `Generate a high-quality, fun caricature of the person or people in this photo in the theme of the Indian Navy. The style should be a 'vivid' cartoon effect. Place them in a naval setting, perhaps on a ship deck or with naval symbols. Exaggerate their features for a humorous, artistic result, but ensure they are still recognizable.` },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const analysisPrompt = `Analyze the person or people in the photo. Create a funny, flattering title for their caricature (e.g., 'Captain Cool', 'The Dynamic Duo'). Then, write a separate witty one-liner (20 words or less) about them. IMPORTANT: For the one-liner, use the pronoun '${pronoun}' to refer to them. For example: 'Leading the charge with a smile, ${pronoun} presence anchors the spirit of Navy Day.' Keep it positive and fun for the Navy Day 2025 event.`;

        const analysisPromise = ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: analysisPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: {
                            type: Type.STRING,
                            description: 'A short, funny, flattering title for the person or couple. Should be 2-4 words.'
                        },
                        analysis: {
                            type: Type.STRING,
                            description: `A witty one-liner, 20 words or less, using the pronoun '${pronoun}'.`
                        }
                    },
                    required: ['title', 'analysis']
                }
            }
        });
        
        const [imageResponse, analysisResponse] = await Promise.all([imagePromise, analysisPromise]);

        const candidate = imageResponse.candidates?.[0];

        if (!candidate) {
            const blockReason = imageResponse.promptFeedback?.blockReason;
            if (blockReason) {
                throw new Error(`Image generation was blocked: ${blockReason}. Please try a different photo.`);
            }
            throw new Error("The model returned an empty response. Please try again.");
        }

        // Check for non-STOP finish reasons which indicate a problem.
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`Image generation failed. Reason: ${candidate.finishReason}.`);
        }
        
        const imagePartFromResponse = candidate.content?.parts?.find(p => p.inlineData);

        if (!imagePartFromResponse || !imagePartFromResponse.inlineData) {
            throw new Error("The model did not return an image, possibly due to safety filters. Please try again with a different photo.");
        }
        
        const cartoonImage = `data:${imagePartFromResponse.inlineData.mimeType};base64,${imagePartFromResponse.inlineData.data}`;
        
        let analysisJson: AnalysisResult;
        try {
            analysisJson = JSON.parse(analysisResponse.text);
            setCharacterAnalysis(analysisJson);
        } catch (parseError) {
            console.error("Failed to parse analysis JSON:", parseError);
            analysisJson = {
                title: "Navy Star",
                analysis: `Ready for an adventure on the high seas!`,
            };
            setCharacterAnalysis(analysisJson);
        }

        const compositeImage = await generateCompositeImage(cartoonImage, analysisJson.title, analysisJson.analysis);
        setGeneratedImage(compositeImage);

        const imageBlob = await dataUrlToBlob(compositeImage);
        const objectUrl = URL.createObjectURL(imageBlob);
        setDownloadUrl(objectUrl);

        try {
            const smallCompositeImage = await resizeImage(compositeImage, 400, 600);
            const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Navy Day Cartoon</title><style>body{margin:0;font-family:sans-serif;background-color:#0f172a;color:white;text-align:center}img{max-width:100%;border-bottom:4px solid #facc15}.container{padding:20px}h1{font-size:1.5em}a{display:inline-block;margin-top:20px;padding:12px 24px;background-color:#3b82f6;color:white;text-decoration:none;font-weight:bold;border-radius:99px}</style></head><body><img src="${smallCompositeImage}" alt="Your Navy Day Cartoon" /><div class="container"><h1>Here's Your Keepsake!</h1><a href="${smallCompositeImage}" download="navy-day-keepsake-2025.jpg">Download Image</a></div></body></html>`;
            const qrDataUrl = `data:text/html,${encodeURIComponent(htmlContent)}`;
            
            if (qrDataUrl.length > 2800) {
                 console.warn("Generated QR code data URL is too long, falling back.");
                 setQrCodeValue(null);
            } else {
                setQrCodeValue(qrDataUrl);
            }
        } catch (qrError: any) {
             console.error("QR Code page generation error:", qrError.message);
            setQrCodeValue(null);
        }

        setAppState('result');

    } catch (e: any) {
        console.error(e);
        setError(`An error occurred: ${e.message || 'Unknown error'}`);
        setAppState('capturing');
    }
  };

  const handleRestart = () => {
    if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
    }
    setAppState('welcome');
    setCapturedImage(null);
    setGeneratedImage(null);
    setDownloadUrl(null);
    setError(null);
    setCharacterAnalysis(null);
    setQrCodeValue(null);
  };
  
  const renderContent = () => {
    switch(appState) {
        case 'welcome':
            return (
                <div className="text-center flex flex-col items-center gap-6">
                    <h2 className="text-5xl font-extrabold tracking-tight">Welcome to the Cartoon Booth!</h2>
                    <p className="max-w-2xl text-lg text-gray-300">
                        Get ready for a fun transformation! We'll snap your picture and create a unique, Indian Navy-themed caricature just for you.
                    </p>
                    <button onClick={() => setAppState('capturing')} className="mt-4 px-10 py-4 bg-blue-600 text-white font-bold text-xl rounded-full hover:bg-blue-500 transition-transform transform hover:scale-105">
                        Start Now
                    </button>
                </div>
            );
        case 'capturing':
            return (
                <div className="w-full flex flex-col items-center gap-4">
                    <h2 className="text-3xl font-bold">Position Your Face(s)</h2>
                    <p className="text-gray-400">Look straight at the camera and smile! Works for one or two people.</p>
                    <WebcamCapture onCapture={handleCapture} />
                    {error && <p className="mt-4 text-red-400 bg-red-900/50 p-3 rounded-lg text-center">{error}</p>}
                </div>
            );
        case 'processing':
            return (
                <div className="text-center flex flex-col items-center gap-6">
                    <h2 className="text-4xl font-bold">Creating Your Navy Caricature...</h2>
                    <p className="text-gray-300">Our digital artist is hard at work!</p>
                    <Spinner />
                </div>
            );
        case 'result':
            return (
                <div className="text-center flex flex-col items-center gap-8 w-full max-w-6xl mx-auto">
                    <div className="mb-4">
                        <h2 className="text-5xl font-extrabold">Ahoy! Navy Day Special</h2>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start w-full">
                        <div className="lg:col-span-3 flex flex-col items-center gap-4">
                             <img src={generatedImage!} alt="Generated cartoon keepsake" className="rounded-lg shadow-2xl border-4 border-yellow-400 w-full" />
                        </div>
                        <div className="lg:col-span-2 flex flex-col items-center gap-6">
                            <div className="w-full p-6 bg-white rounded-lg shadow-lg">
                               <h3 className="text-2xl font-bold text-gray-900">Scan to Share!</h3>
                               {qrCodeValue ? (
                                    <QRCodeSVG value={qrCodeValue} size={180} bgColor="#ffffff" fgColor="#000000" />
                               ) : (
                                   <div className="w-[180px] h-[180px] flex items-center justify-center bg-gray-100 rounded-md text-center text-gray-600 p-4">
                                       QR code could not be generated for this image. Please use the download button instead.
                                   </div>
                               )}
                            </div>
                             <div className="flex items-center gap-4 mt-2">
                                {downloadUrl && (
                                   <a
                                       href={downloadUrl}
                                       download={`navy-day-keepsake-2025.jpg`}
                                       className="px-6 py-3 bg-green-600 text-white font-bold rounded-full hover:bg-green-500 transition-transform transform hover:scale-105 text-lg"
                                   >
                                       Download
                                   </a>
                                )}
                                <button
                                    onClick={() => window.print()}
                                    className="px-6 py-3 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-500 transition-transform transform hover:scale-105 text-lg"
                                >
                                    Print Keepsake
                                </button>
                               </div>
                        </div>
                    </div>
                    <button onClick={handleRestart} className="mt-6 px-10 py-4 bg-blue-600 text-white font-bold text-xl rounded-full hover:bg-blue-500 transition-transform transform hover:scale-105">
                        Start Over
                    </button>
                </div>
            );
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
       {appState === 'result' && generatedImage && (
            <div id="printable-area">
                <div className="w-full h-full p-8 flex flex-col items-center justify-center bg-white text-black">
                    <img src={generatedImage} alt="Your Navy Day Keepsake" className="w-full max-w-2xl"/>
                </div>
            </div>
        )}
       <header className="absolute top-0 left-0 w-full p-4 text-center">
         <h1 className="text-2xl font-bold text-blue-300 tracking-wider">Navy Day 2025 Cartoon Booth</h1>
       </header>
       <main className="flex items-center justify-center w-full flex-1">
        {renderContent()}
       </main>
       <footer className="w-full text-center p-4 text-gray-500 text-sm">
           Powered by Gemini
       </footer>
    </div>
  );
};

export default App;
