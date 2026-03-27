import { Eye, EyeOff, Shield } from 'lucide-react';
import type { CoverageTier } from '../types';

interface Props {
  tiers: CoverageTier[];
  showCoverage: boolean;
  onToggleCoverage: () => void;
  onToggleTier: (id: string) => void;
}

function probabilityBar(prob: number, color: string) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${prob * 100}%`, background: color }}
        />
      </div>
      <span className="text-[10px] text-white/50 w-8 text-right tabular-nums">
        {(prob * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export default function CoveragePanel({
  tiers,
  showCoverage,
  onToggleCoverage,
  onToggleTier,
}: Props) {
  return (
    <div className="space-y-2">
      {/* Master toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleCoverage}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold transition-all ${
            showCoverage
              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
              : 'bg-white/5 text-white/40 hover:text-white/60'
          }`}
        >
          <Shield className="w-3 h-3" />
          {showCoverage ? 'Coverage On' : 'Coverage Off'}
        </button>
        <span className="text-[10px] text-white/30 ml-auto">2 mi radius</span>
      </div>

      {showCoverage && (
        <div className="space-y-1.5 pl-0.5">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`flex items-center gap-2 group transition-opacity ${
                tier.visible ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <button
                onClick={() => onToggleTier(tier.id)}
                className="text-white/40 hover:text-white/70 transition-colors"
                title={tier.visible ? 'Hide tier' : 'Show tier'}
              >
                {tier.visible
                  ? <Eye className="w-3 h-3" />
                  : <EyeOff className="w-3 h-3" />
                }
              </button>

              <div
                className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20 flex-shrink-0"
                style={{ background: tier.color, boxShadow: `0 0 6px ${tier.color}60` }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-semibold text-white/80">{tier.label}</span>
                  <span className="text-[10px] text-white/30">alt</span>
                </div>
                {probabilityBar(tier.probability, tier.color)}
              </div>
            </div>
          ))}

          {/* Legend note */}
          <p className="text-[9px] text-white/20 pt-1 leading-snug">
            Coverage probability within {tiers[0]?.radiusMiles ?? 2} mi of each detection node.
            Overlapping regions = multi-node coverage.
          </p>
        </div>
      )}
    </div>
  );
}
