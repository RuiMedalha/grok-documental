'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X, ScanLine, CheckCircle2 } from 'lucide-react';
import jsQR from 'jsqr';

interface Props {
  onScan: (qrText: string) => void | Promise<void>;
  onClose?: () => void;
}

export function AtQrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(true);
  const [last, setLast] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Permissão de câmara negada. Autorize nas definições do browser.'
            : 'Não foi possível aceder à câmara.',
        );
      }
    }

    function tick() {
      if (!active || cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h, {
            inversionAttempts: 'attemptBoth',
          });
          if (code?.data && code.data !== last) {
            setLast(code.data);
            setActive(false);
            stop();
            Promise.resolve(onScan(code.data)).catch(() => {});
            return;
          }
        }
      }
      raf.current = requestAnimationFrame(tick);
    }

    function stop() {
      cancelAnimationFrame(raf.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-white">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScanLine size={18} className="text-sky-400" />
          Ler QR Code AT
        </div>
        <button
          type="button"
          className="p-2 rounded-lg bg-white/10"
          onClick={() => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            onClose?.();
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />
        {/* Viewfinder */}
        <div className="relative z-10 w-64 h-64 border-2 border-sky-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-sky-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-sky-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-sky-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-sky-400 rounded-br-xl" />
        </div>
      </div>

      <div className="p-4 text-center text-sm text-white/80 space-y-2">
        {error ? (
          <p className="text-rose-300">{error}</p>
        ) : last ? (
          <p className="text-emerald-300 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} /> QR lido
          </p>
        ) : (
          <p>Aponte a câmara ao QR Code da fatura portuguesa</p>
        )}
        <p className="text-xs text-white/50">
          Funciona melhor com boa luz e QR nítido (mín. ~3 cm)
        </p>
      </div>
    </div>
  );
}

/** Botão compacto para abrir o scanner */
export function AtQrScanButton({
  onScan,
  label = 'QR AT',
}: {
  onScan: (qrText: string) => void | Promise<void>;
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
        <AtQrScanner
          onScan={async (text) => {
            await onScan(text);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
