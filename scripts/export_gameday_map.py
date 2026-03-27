#!/usr/bin/env python3
"""
Generate a high-resolution map image of all 2025 UF gameday drone flights
on a light street map background for PowerPoint slides.
"""

import json
import math
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import Circle
from matplotlib.collections import LineCollection
import contextily as cx

DATA_PATH = 'clean/animation_data.json'
OUTPUT_PATH = 'exports/2025_gameday_flights.png'

BHG = (29.6500, -82.3486)
TFR_RADIUS_NM = 3.0
NM_TO_DEG = 1 / 60
ONE_MILE_DEG = 1.60934 / 111

CAMPUS = {
    'north': 29.6520, 'south': 29.6355,
    'west': -82.3700, 'east': -82.3265,
}

DEFAULT_NODES = [
    ('Ben Hill Griffin',         29.6500, -82.3486, '#10b981'),
    ("O'Connell Center",        29.6498, -82.3514, '#06b6d4'),
    ('Reitz Union',             29.6462, -82.3478, '#8b5cf6'),
    ('Library West',            29.6510, -82.3432, '#f59e0b'),
    ('Century Tower',           29.6491, -82.3430, '#ef4444'),
    ('Marston Science Library', 29.6484, -82.3445, '#ec4899'),
    ('Turlington Hall',         29.6490, -82.3452, '#14b8a6'),
    ('SW Rec Center',           29.6418, -82.3503, '#6366f1'),
    ('Heavener Hall',           29.6510, -82.3462, '#84cc16'),
    ('Newell Hall',             29.6478, -82.3420, '#f97316'),
]

def load_nodes():
    """Load nodes from exported JSON if available, else use defaults."""
    for path in ['detection-nodes.json', 'exports/detection-nodes.json', os.path.expanduser('~/Downloads/detection-nodes.json')]:
        if os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            nodes = [(n['name'], n['lat'], n['lng'], n.get('color', '#10b981')) for n in data if n.get('visible', True)]
            print(f'Loaded {len(nodes)} nodes from {path}')
            return nodes
    print(f'Using {len(DEFAULT_NODES)} default nodes')
    return DEFAULT_NODES

DETECTION_NODES = load_nodes()

GAME_COLORS = {
    '2025-08-30': '#d93a00',
    '2025-10-04': '#008a6e',
    '2025-10-18': '#c2185b',
    '2025-11-22': '#1565c0',
}

GAME_LABELS = {
    '2025-08-30': 'UF vs LIU (Aug 30)',
    '2025-10-04': 'UF vs Texas (Oct 4)',
    '2025-10-18': 'UF vs Miss State (Oct 18)',
    '2025-11-22': 'UF vs Tennessee (Nov 22)',
}

STROKE = pe.withStroke(linewidth=3, foreground='white')
STROKE_THIN = pe.withStroke(linewidth=2, foreground='white')

def date_key(unix_ts):
    from datetime import datetime, timezone, timedelta
    dt = datetime.fromtimestamp(unix_ts, tz=timezone(timedelta(hours=-4)))
    return dt.strftime('%Y-%m-%d')

def main():
    os.makedirs('exports', exist_ok=True)
    with open(DATA_PATH) as f:
        data = json.load(f)

    fig, ax = plt.subplots(1, 1, figsize=(16, 12), dpi=200)

    pad = 0.015
    min_lat, max_lat = 29.600, 29.665
    min_lng, max_lng = -82.42, -82.30
    ax.set_xlim(min_lng - pad, max_lng + pad)
    ax.set_ylim(min_lat - pad, max_lat + pad)
    ax.set_aspect(1 / math.cos(math.radians(BHG[0])))

    # Add street map tiles
    cx.add_basemap(
        ax, crs='EPSG:4326',
        source=cx.providers.CartoDB.Positron,
        zoom=14,
    )

    # TFR circle
    tfr_r_deg = TFR_RADIUS_NM * NM_TO_DEG
    tfr = Circle(
        (BHG[1], BHG[0]), tfr_r_deg,
        fill=False, edgecolor='#cc0000',
        linewidth=1.5, linestyle='--', alpha=0.5, zorder=2
    )
    ax.add_patch(tfr)

    # UF Campus
    campus = plt.Rectangle(
        (CAMPUS['west'], CAMPUS['south']),
        CAMPUS['east'] - CAMPUS['west'],
        CAMPUS['north'] - CAMPUS['south'],
        fill=False, edgecolor='#16a34a',
        linewidth=2, alpha=0.6, zorder=2
    )
    ax.add_patch(campus)

    # Detection nodes with 1-mile coverage rings
    for name, nlat, nlng, ncolor in DETECTION_NODES:
        ring = Circle(
            (nlng, nlat), ONE_MILE_DEG,
            fill=True, facecolor=ncolor, edgecolor=ncolor,
            linewidth=0.5, alpha=0.06, zorder=3
        )
        ax.add_patch(ring)
        ring_edge = Circle(
            (nlng, nlat), ONE_MILE_DEG,
            fill=False, edgecolor=ncolor,
            linewidth=0.7, alpha=0.3, zorder=3
        )
        ax.add_patch(ring_edge)
        ax.plot(nlng, nlat, 'o', color=ncolor, markersize=6, zorder=12,
                markeredgecolor='white', markeredgewidth=1)
        ax.annotate(name, (nlng, nlat),
                    textcoords='offset points', xytext=(7, -9),
                    fontsize=5.5, color='#333', fontweight='bold',
                    path_effects=[STROKE_THIN])

    # Plot flights per game
    game_stats = {}
    for drone_id, pts in data['drones'].items():
        if len(pts) < 2:
            continue
        dk = date_key(pts[0][0])
        color = GAME_COLORS.get(dk, '#555')

        if dk not in game_stats:
            game_stats[dk] = {'ops': 0, 'pts': 0, 'airborne': 0}
        game_stats[dk]['ops'] += 1
        game_stats[dk]['pts'] += len(pts)

        lats = [p[1] for p in pts]
        lngs = [p[2] for p in pts]
        airborne = [p[8] != 0 for p in pts]

        segments = []
        colors_seg = []
        for i in range(len(pts) - 1):
            if airborne[i] or airborne[i + 1]:
                segments.append([(lngs[i], lats[i]), (lngs[i + 1], lats[i + 1])])
                colors_seg.append(color)
                game_stats[dk]['airborne'] += 1

        if segments:
            lc = LineCollection(segments, colors=colors_seg, linewidths=1.5, alpha=0.8, zorder=5)
            ax.add_collection(lc)

        # Pilot location
        pilot_lats = [p[6] for p in pts if p[6] is not None]
        pilot_lngs = [p[7] for p in pts if p[7] is not None]
        if pilot_lats:
            ax.plot(pilot_lngs[0], pilot_lats[0], 's', color=color, markersize=5, alpha=0.8, zorder=7,
                    markeredgecolor='white', markeredgewidth=0.8)

    # Title
    ax.text(min_lng - pad + 0.004, max_lat + pad - 0.003,
            '2025 UF GAMEDAY DRONE ACTIVITY',
            fontsize=15, color='#111', fontweight='bold', zorder=20,
            path_effects=[STROKE])

    # Legend
    for i, (dk, label) in enumerate(GAME_LABELS.items()):
        color = GAME_COLORS[dk]
        stats = game_stats.get(dk, {'ops': 0})
        y = max_lat + pad - 0.008 - i * 0.005
        x = min_lng - pad + 0.004
        ax.plot(x, y, 'o', color=color, markersize=7, zorder=20,
                markeredgecolor='white', markeredgewidth=1)
        ax.text(x + 0.003, y, f'{label}  ({stats["ops"]} ops)',
                fontsize=8, color=color, va='center', fontweight='bold', zorder=20,
                path_effects=[STROKE_THIN])

    # Summary
    total_ops = sum(s['ops'] for s in game_stats.values())
    total_airborne = sum(s['airborne'] for s in game_stats.values())
    ax.text(min_lng - pad + 0.004, max_lat + pad - 0.030,
            f'{total_ops} drone operations · {total_airborne:,} airborne data points · 4 home games · 10 detection nodes',
            fontsize=7, color='#666', zorder=20,
            path_effects=[pe.withStroke(linewidth=2, foreground='white')])

    # Labels
    ax.text(-82.347, 29.634, 'UF Campus', fontsize=7, color='#16a34a', fontweight='bold',
            ha='center', path_effects=[STROKE_THIN])
    ax.text(BHG[1] + tfr_r_deg * 0.65, BHG[0] + tfr_r_deg * 0.65, 'TFR (3 NM)',
            fontsize=7, color='#cc0000', fontweight='bold',
            path_effects=[STROKE_THIN])

    ax.set_axis_off()

    # Attribution
    ax.text(max_lng + pad - 0.002, min_lat - pad + 0.002,
            '© CARTO · Data: Decentrafly',
            fontsize=5, color='#999', ha='right', va='bottom')

    plt.tight_layout()
    plt.savefig(OUTPUT_PATH, dpi=200, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    print(f'Exported: {OUTPUT_PATH}')
    print(f'Stats: {total_ops} operations, {total_airborne:,} airborne points across {len(game_stats)} games')

if __name__ == '__main__':
    main()
