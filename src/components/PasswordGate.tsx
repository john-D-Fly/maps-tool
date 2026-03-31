import { useState, useCallback, type FormEvent } from 'react';
import { Settings, Lock, Unlock, LogOut } from 'lucide-react';

interface Props {
  authenticated: boolean;
  hasPassword: boolean;
  onVerify: (password: string) => Promise<boolean>;
  onLogout: () => void;
  onOpenPrivate: () => void;
}

export default function PasswordGate({
  authenticated,
  hasPassword,
  onVerify,
  onLogout,
  onOpenPrivate,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!hasPassword) return null;

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setError(false);
      const pw = new FormData(e.currentTarget).get('password') as string;
      const ok = await onVerify(pw);
      if (ok) {
        setModalOpen(false);
        onOpenPrivate();
      } else {
        setError(true);
      }
      setLoading(false);
    },
    [onVerify, onOpenPrivate],
  );

  if (authenticated) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenPrivate}
          className="p-1 rounded text-emerald-400 hover:bg-white/10 transition-colors"
          title="Private area"
        >
          <Unlock className="w-4 h-4" />
        </button>
        <button
          onClick={onLogout}
          className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors"
          title="Lock"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
        title="Private access"
      >
        <Settings className="w-4 h-4" />
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-4 bg-gray-900 border border-gray-700 rounded-xl p-6 w-72 shadow-2xl"
          >
            <Lock className="w-6 h-6 text-blue-400" />
            <p className="text-sm text-gray-400 text-center">Enter password for private access</p>
            <input
              name="password"
              type="password"
              autoFocus
              placeholder="Password"
              className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-400 text-sm -mt-2">Incorrect password</p>}
            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white/70 text-sm transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {loading ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
