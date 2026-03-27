import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import type { NominatimResult } from '../lib/api';
import { searchPlaces, resolveGeojson } from '../lib/api';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

interface Props {
  onAdd: (name: string, feature: Feature<Polygon | MultiPolygon>) => void;
}

export default function SearchBar({ onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchPlaces(query);
        setResults(res);
        setOpen(res.length > 0);
      } catch {
        setError('Search failed — try again');
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function handleSelect(result: NominatimResult) {
    setLoadingId(result.place_id);
    setError(null);
    try {
      const feature = await resolveGeojson(result);
      if (!feature) {
        setError('No boundary data available for this place');
        return;
      }
      const shortName = result.display_name.split(',')[0].trim();
      onAdd(shortName, feature);
      setQuery('');
      setOpen(false);
      setResults([]);
    } catch {
      setError('Failed to load boundary');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-3 py-2 focus-within:border-blue-400 focus-within:bg-white/15 transition-all">
        {loading ? (
          <Loader2 className="w-4 h-4 text-white/50 animate-spin flex-shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any place…"
          className="bg-transparent text-sm text-white placeholder-white/40 outline-none flex-1 min-w-0"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setOpen(false);
              setResults([]);
              inputRef.current?.focus();
            }}
            className="text-white/40 hover:text-white/70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-1 px-1">{error}</p>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg bg-gray-900 border border-white/20 shadow-2xl max-h-72 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => handleSelect(r)}
              disabled={loadingId === r.place_id}
              className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50 border-b border-white/5 last:border-0"
            >
              {loadingId === r.place_id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-blue-400" />
              ) : (
                <div className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className="truncate">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
