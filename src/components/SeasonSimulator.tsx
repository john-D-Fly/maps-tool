import { useState, useCallback } from 'react';
import { Calendar, X, Play, Loader2, Shield } from 'lucide-react';
import { generateSeason2026, generateSingleGame, getSchedule2026, type SeasonSimData } from '../lib/seasonGenerator';

interface Props {
  onLoadSeason: (data: SeasonSimData) => void;
  onClear: () => void;
  isActive: boolean;
}

type Phase = 'idle' | 'schedule' | 'generating' | 'ready';

export default function SeasonSimulator({ onLoadSeason, onClear, isActive }: Props) {
  const [phase, setPhase] = useState<Phase>(isActive ? 'ready' : 'idle');
  const [genData, setGenData] = useState<SeasonSimData | null>(null);

  const schedule = getSchedule2026();

  const handleGenerate = useCallback(() => {
    setPhase('generating');
    setTimeout(() => {
      const data = generateSeason2026();
      setGenData(data);
      onLoadSeason(data);
      setPhase('ready');
    }, 500);
  }, [onLoadSeason]);

  const handleGenerateSingle = useCallback((gameIndex: number) => {
    setPhase('generating');
    setTimeout(() => {
      const data = generateSingleGame(gameIndex);
      setGenData(data);
      onLoadSeason(data);
      setPhase('ready');
    }, 300);
  }, [onLoadSeason]);

  const handleClose = useCallback(() => {
    onClear();
    setGenData(null);
    setPhase('idle');
  }, [onClear]);

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('schedule')}
        className="absolute top-16 right-4 z-[1000] flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-white hover:bg-gray-800/90 hover:border-white/30 transition-all shadow-2xl group"
      >
        <Calendar className="w-5 h-5 text-orange-400 group-hover:text-orange-300" />
        <div className="text-left">
          <div className="text-sm font-semibold">2026 Season Sim</div>
          <div className="text-[10px] text-white/40">Generate training data</div>
        </div>
      </button>
    );
  }

  if (phase === 'generating') {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-white/20 rounded-2xl px-8 py-6 text-center shadow-2xl">
          <Loader2 className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-3" />
          <div className="text-sm text-white font-medium">Generating 2026 season data…</div>
          <div className="text-xs text-white/40 mt-1">Creating drone activity for {schedule.filter(g => g.tier !== 'away').length} home games</div>
        </div>
      </div>
    );
  }

  if (phase === 'schedule') {
    const homeGames = schedule.filter((g) => g.tier !== 'away');
    const awayGames = schedule.filter((g) => g.tier === 'away');

    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-gray-900/95 border border-white/20 rounded-2xl px-6 py-5 shadow-2xl w-96 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-400" />
              <h3 className="text-sm font-bold text-white">2026 UF Football Season</h3>
            </div>
            <button onClick={() => setPhase('idle')} className="text-white/30 hover:text-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-white/50 mb-4">
            Click a game to simulate that gameday, or generate the full season.
          </p>

          <div className="mb-3">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 font-semibold">Home Games — click to simulate</div>
            <div className="space-y-1">
              {homeGames.map((g) => {
                const idx = schedule.indexOf(g);
                return (
                  <button
                    key={g.date}
                    onClick={() => handleGenerateSingle(idx)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left"
                  >
                    <Shield className={`w-3.5 h-3.5 flex-shrink-0 ${g.tier === 'high' ? 'text-red-400' : g.tier === 'mid' ? 'text-amber-400' : 'text-green-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/90 font-medium">UF vs {g.opponent}</div>
                      <div className="text-[10px] text-white/40">{g.date} · Kickoff {g.kickoff} ET</div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                      g.tier === 'high' ? 'bg-red-500/20 text-red-300' : g.tier === 'mid' ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'
                    }`}>
                      {g.tier === 'high' ? 'HIGH' : g.tier === 'mid' ? 'MED' : 'LOW'}
                    </span>
                    <Play className="w-3 h-3 text-white/30" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 font-semibold">Away ({awayGames.length})</div>
            <div className="flex flex-wrap gap-1">
              {awayGames.map((g) => (
                <span key={g.date} className="text-[10px] text-white/30 bg-white/3 px-2 py-0.5 rounded">{g.opponent}</span>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-3">
            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300/80 hover:bg-orange-500/25 transition-colors text-xs"
            >
              <Play className="w-3.5 h-3.5" />
              Generate Full Season ({homeGames.length} games)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ready
  const totalOps = genData?.events.reduce((s, e) => s + e.stats.operations, 0) ?? 0;
  const totalAirborne = genData?.events.reduce((s, e) => s + e.stats.airborne, 0) ?? 0;

  return (
    <div className="absolute top-16 right-4 z-[1000] bg-gray-900/90 backdrop-blur-md border border-orange-500/30 rounded-xl p-3 w-56 shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-bold text-white">2026 Season Active</span>
        </div>
        <button onClick={handleClose} className="text-white/30 hover:text-white/70">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-white/50">Home Games</span>
          <span className="text-white font-mono">{genData?.events.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Total Operations</span>
          <span className="text-orange-300 font-mono font-bold">{totalOps}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Airborne Points</span>
          <span className="text-white font-mono">{totalAirborne.toLocaleString()}</span>
        </div>
      </div>
      <p className="text-[9px] text-white/30 mt-2">Use the Drone Animation player to scrub through games</p>
    </div>
  );
}
