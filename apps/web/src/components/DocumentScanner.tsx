'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X, Check, RotateCcw, SwitchCamera, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface Props {
  onDone?: (doc: any) => void;
  onClose?: () => void;
}

/**
 * Scanner documental via câmara do telemóvel:
 * captura → contraste/ nitidez simples → upload com origin=scanner
 */
export function DocumentScanner({ onDone, onClose }: Props) {
  const { accessToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [preview, setPreview] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function start() {
      try {
        stream?.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch {
        setError('Não foi possível abrir a câmara. Verifique permissões.');
      }
    }
    if (!preview) start();
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, preview]);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    if (enhanced) {
      // Melhoria tipo "scan": contraste + leve threshold
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // contraste
        let v = (gray - 128) * 1.35 + 128;
        v = Math.max(0, Math.min(255, v));
        // unsharp light: push mid tones toward B/W document
        const out = v > 180 ? 255 : v < 60 ? 0 : v;
        d[i] = d[i + 1] = d[i + 2] = out;
      }
      ctx.putImageData(img, 0, 0);
    }

    setPreview(canvas.toDataURL('image/jpeg', 0.92));
    stream?.getTracks().forEach((t) => t.stop());
  }

  async function confirmUpload() {
    if (!preview || !accessToken) return;
    setUploading(true);
    setError('');
    try {
      const res = await fetch(preview);
      const blob = await res.blob();
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const doc = await api.uploadDocument(accessToken, file, 'scanner');
      // tentar extrair / QR se o pipeline automático não chegar a tempo
      try {
        await api.extractDocument(accessToken, doc.id);
      } catch {
        /* optional */
      }
      onDone?.(doc);
      onClose?.();
    } catch (e: any) {
      setError(e.message || 'Erro no upload do scan');
    } finally {
      setUploading(false);
    }
  }

  function retake() {
    setPreview(null);
    setError('');
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Camera size={18} className="text-sky-400" />
          Scanner documental
        </div>
        <button
          type="button"
          className="p-2 rounded-lg bg-white/10"
          onClick={() => {
            stream?.getTracks().forEach((t) => t.stop());
            onClose?.();
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {!preview ? (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Guia A4 */}
            <div className="relative z-10 w-[85%] max-w-sm aspect-[1/1.35] border-2 border-dashed border-sky-400/70 rounded-lg pointer-events-none">
              <div className="absolute -top-6 left-0 right-0 text-center text-[11px] text-sky-300/90">
                Alinhe o documento dentro da moldura
              </div>
            </div>
          </>
        ) : (
          <img src={preview} alt="Scan" className="max-h-full max-w-full object-contain" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && <p className="px-4 text-center text-sm text-rose-300">{error}</p>}

      <div className="p-4 space-y-3 safe-bottom">
        {!preview ? (
          <>
            <label className="flex items-center justify-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={enhanced}
                onChange={(e) => setEnhanced(e.target.checked)}
                className="rounded"
              />
              <Sparkles size={12} />
              Melhorar como scan (contraste B/W)
            </label>
            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                className="p-3 rounded-full bg-white/10"
                onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                title="Alternar câmara"
              >
                <SwitchCamera size={22} />
              </button>
              <button
                type="button"
                onClick={capture}
                className="w-16 h-16 rounded-full border-4 border-white bg-sky-500 shadow-lg active:scale-95 transition-transform"
                aria-label="Capturar"
              />
              <div className="w-12" />
            </div>
            <p className="text-center text-[11px] text-white/50">
              Luz uniforme · fundo contrastante · sem sombra
            </p>
          </>
        ) : (
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={retake}>
              <RotateCcw size={16} /> Repetir
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={uploading}
              onClick={confirmUpload}
            >
              <Check size={16} /> {uploading ? 'A enviar…' : 'Usar scan'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ScannerButton({
  onDone,
  label = 'Scanner',
}: {
  onDone?: (doc: any) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        <Camera size={14} />
        {label}
      </button>
      {open && (
        <DocumentScanner
          onDone={onDone}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
