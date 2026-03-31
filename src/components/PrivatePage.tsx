import { ArrowLeft, Lock } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export default function PrivatePage({ onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-950 text-white gap-6">
      <div className="flex items-center gap-3">
        <Lock className="w-8 h-8 text-emerald-400" />
        <h1 className="text-2xl font-bold tracking-tight">Private Area</h1>
      </div>
      <p className="text-gray-400 text-sm max-w-md text-center">
        This section is under construction. Content coming soon.
      </p>
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-white/80 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Map
      </button>
    </div>
  );
}
