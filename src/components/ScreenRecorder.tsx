import { useState, useRef, useCallback } from 'react';
import { Video, Square, Download } from 'lucide-react';

interface Props {
  targetSelector: string;
}

export default function ScreenRecorder({ targetSelector: _target }: Props) {
  const [recording, setRecording] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Use getDisplayMedia to capture the screen/tab
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: 30,
        } as MediaTrackConstraints,
        audio: false,
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
        videoBitsPerSecond: 5_000_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        blobRef.current = blob;
        setHasVideo(true);
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
      };

      // Stream ended by user (clicking "Stop sharing")
      stream.getVideoTracks()[0].onended = () => {
        if (recorder.state === 'recording') recorder.stop();
      };

      // 3-second countdown
      setCountdown(3);
      await new Promise<void>((resolve) => {
        let c = 3;
        const iv = setInterval(() => {
          c--;
          setCountdown(c);
          if (c <= 0) { clearInterval(iv); resolve(); }
        }, 1000);
      });

      recorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      setCountdown(0);
    } catch {
      setRecording(false);
      setCountdown(0);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const downloadVideo = useCallback(() => {
    if (!blobRef.current) return;
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maps-animation-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const clearVideo = useCallback(() => {
    blobRef.current = null;
    setHasVideo(false);
  }, []);

  if (countdown > 0) {
    return (
      <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/30 pointer-events-none">
        <div className="text-8xl font-bold text-white animate-pulse">{countdown}</div>
      </div>
    );
  }

  if (hasVideo) {
    return (
      <div className="absolute bottom-6 left-4 z-[1000] flex items-center gap-2">
        <button
          onClick={downloadVideo}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600/90 backdrop-blur-md border border-green-400/30 text-white hover:bg-green-500/90 transition-all shadow-xl text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Download Recording
        </button>
        <button
          onClick={clearVideo}
          className="px-3 py-2.5 rounded-xl bg-gray-900/80 backdrop-blur-md border border-white/20 text-white/60 hover:text-white transition-all text-xs"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (recording) {
    return (
      <button
        onClick={stopRecording}
        className="absolute bottom-6 left-4 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/90 backdrop-blur-md border border-red-400/30 text-white hover:bg-red-500/90 transition-all shadow-xl animate-pulse"
      >
        <Square className="w-4 h-4" />
        <span className="text-sm font-medium">Stop Recording</span>
        <span className="w-2 h-2 rounded-full bg-red-300 animate-ping" />
      </button>
    );
  }

  return (
    <button
      onClick={startRecording}
      className="absolute bottom-6 left-4 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900/80 backdrop-blur-md border border-white/20 text-white/70 hover:text-white hover:bg-gray-800/90 transition-all shadow-xl text-sm"
    >
      <Video className="w-4 h-4 text-red-400" />
      Record
    </button>
  );
}
