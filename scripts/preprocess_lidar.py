#!/usr/bin/env python3
"""
Download LiDAR point cloud data from the USGS EPT endpoint for Alachua County
(FL Peninsular FDEM 2018) and generate DSM / building-mask heightmap JSONs
for the UF campus area.

Usage:
    conda activate lidar          # environment with PDAL
    python scripts/preprocess_lidar.py

Output:
    public/lidar/uf-campus.json            – DSM heightmap (ground + buildings)
    public/lidar/uf-campus-buildings.json   – boolean building mask
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import numpy as np

try:
    import pdal
except ImportError:
    sys.exit(
        "PDAL Python bindings not found.\n"
        "Install via conda:  conda install -c conda-forge python-pdal pdal\n"
        "  (pip install pdal requires the C++ PDAL library pre-installed)"
    )

# ── Configuration ───────────────────────────────────────────────────────────

EPT_URL = (
    "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/"
    "FL_Peninsular_FDEM_Alachua_2018/ept.json"
)

# UF campus bounding box (WGS84)
SOUTH, NORTH = 29.636, 29.658
WEST, EAST = -82.370, -82.335

RESOLUTION_M = 5  # metres per cell

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "lidar"

# ── Helpers ─────────────────────────────────────────────────────────────────

def _bbox_to_ept_bounds(south: float, north: float, west: float, east: float) -> str:
    """EPT reader wants ([xmin, xmax], [ymin, ymax]) in the CRS of the data.
    The Alachua EPT is in EPSG:6440 (NAD83(2011) / Florida North ftUS).
    We pass WGS84 bounds and let PDAL reproject via the `bounds` + `override_srs`
    approach; however the simpler route is to use the `polygon` filter after
    reprojection, so here we just build a WKT polygon for cropping."""
    return (
        f"POLYGON(({west} {south}, {east} {south}, {east} {north}, "
        f"{west} {north}, {west} {south}))"
    )


def _grid_shape(south: float, north: float, west: float, east: float,
                res_m: float) -> tuple[int, int]:
    """Return (rows, cols) for the output raster."""
    lat_span_m = (north - south) * 111_320
    mid_lat = math.radians((north + south) / 2)
    lng_span_m = (east - west) * 111_320 * math.cos(mid_lat)
    rows = max(1, int(round(lat_span_m / res_m)))
    cols = max(1, int(round(lng_span_m / res_m)))
    return rows, cols


def _rasterize(points: np.ndarray, classification: np.ndarray,
               south: float, north: float, west: float, east: float,
               rows: int, cols: int,
               classes: list[int] | None = None) -> np.ndarray:
    """Bin points into a (rows, cols) grid keeping the *max* Z per cell.
    `classes` filters to specific LAS classification codes (None = all)."""
    grid = np.full((rows, cols), np.nan, dtype=np.float32)

    mask = np.ones(len(points), dtype=bool)
    if classes:
        mask = np.isin(classification, classes)

    xs = points["X"][mask]
    ys = points["Y"][mask]
    zs = points["Z"][mask]

    col_idx = np.clip(
        ((xs - west) / (east - west) * cols).astype(int), 0, cols - 1
    )
    row_idx = np.clip(
        ((north - ys) / (north - south) * rows).astype(int), 0, rows - 1
    )

    for r, c, z in zip(row_idx, col_idx, zs):
        if np.isnan(grid[r, c]) or z > grid[r, c]:
            grid[r, c] = z

    return grid


def _fill_nans(grid: np.ndarray) -> np.ndarray:
    """Simple nearest-neighbour fill for NaN cells (areas with no returns)."""
    from scipy.ndimage import distance_transform_edt  # type: ignore[import-untyped]
    mask = np.isnan(grid)
    if not mask.any():
        return grid
    ind = distance_transform_edt(mask, return_distances=False, return_indices=True)
    return grid[tuple(ind)]


def _fill_nans_simple(grid: np.ndarray) -> np.ndarray:
    """Fallback NaN fill without scipy – uses iterative averaging."""
    result = grid.copy()
    mask = np.isnan(result)
    if not mask.any():
        return result
    mean_val = np.nanmean(result)
    result[mask] = mean_val
    return result


# ── Main pipeline ───────────────────────────────────────────────────────────

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows, cols = _grid_shape(SOUTH, NORTH, WEST, EAST, RESOLUTION_M)
    print(f"Grid size: {rows} rows × {cols} cols  ({rows * cols:,} cells)")
    print(f"Bounds: N={NORTH} S={SOUTH} E={EAST} W={WEST}")
    print(f"Resolution: {RESOLUTION_M}m")

    crop_wkt = _bbox_to_ept_bounds(SOUTH, NORTH, WEST, EAST)

    pipeline_json = json.dumps({
        "pipeline": [
            {
                "type": "readers.ept",
                "filename": EPT_URL,
                "threads": 4,
            },
            {
                "type": "filters.reprojection",
                "out_srs": "EPSG:4326",
            },
            {
                "type": "filters.crop",
                "polygon": crop_wkt,
            },
            {
                "type": "filters.range",
                "limits": "Classification[2:2],Classification[6:6]",
            },
        ]
    })

    print("\nRunning PDAL pipeline (streaming from EPT – may take a few minutes)…")
    pipeline = pdal.Pipeline(pipeline_json)
    n_points = pipeline.execute()
    print(f"Retrieved {n_points:,} points")

    if n_points == 0:
        sys.exit("No points returned. Check bounds / EPT URL.")

    arrays = pipeline.arrays
    pts = arrays[0]

    x = pts["X"]
    y = pts["Y"]
    z = pts["Z"]
    classification = pts["Classification"]

    print(f"X range: {x.min():.6f} – {x.max():.6f}")
    print(f"Y range: {y.min():.6f} – {y.max():.6f}")
    print(f"Z range: {z.min():.2f} – {z.max():.2f} m")

    cls_unique, cls_counts = np.unique(classification, return_counts=True)
    for c, n in zip(cls_unique, cls_counts):
        print(f"  Class {c}: {n:,} points")

    # DSM: ground (2) + buildings (6) – max Z
    print("\nRasterizing DSM (ground + buildings)…")
    dsm = _rasterize(pts, classification, SOUTH, NORTH, WEST, EAST, rows, cols,
                     classes=[2, 6])
    nan_pct = np.isnan(dsm).sum() / dsm.size * 100
    print(f"  NaN cells: {nan_pct:.1f}%")

    try:
        dsm = _fill_nans(dsm)
    except ImportError:
        print("  scipy not available – using simple NaN fill")
        dsm = _fill_nans_simple(dsm)

    # Building mask: cells where class-6 points exist
    print("Generating building mask…")
    bldg_grid = _rasterize(pts, classification, SOUTH, NORTH, WEST, EAST,
                           rows, cols, classes=[6])
    building_mask = (~np.isnan(bldg_grid)).astype(int).tolist()

    dsm_path = OUT_DIR / "uf-campus.json"
    elevation_list = [round(float(v), 2) for v in dsm.ravel()]

    dsm_data = {
        "bounds": {"north": NORTH, "south": SOUTH, "east": EAST, "west": WEST},
        "resolutionMeters": RESOLUTION_M,
        "rows": rows,
        "cols": cols,
        "elevation": elevation_list,
        "stats": {
            "minElevation": round(float(np.nanmin(dsm)), 2),
            "maxElevation": round(float(np.nanmax(dsm)), 2),
            "meanElevation": round(float(np.nanmean(dsm)), 2),
        },
    }

    with open(dsm_path, "w") as f:
        json.dump(dsm_data, f)
    size_kb = dsm_path.stat().st_size / 1024
    print(f"\n✓ DSM written to {dsm_path}  ({size_kb:.0f} KB)")

    bldg_path = OUT_DIR / "uf-campus-buildings.json"
    bldg_data = {
        "bounds": {"north": NORTH, "south": SOUTH, "east": EAST, "west": WEST},
        "rows": rows,
        "cols": cols,
        "mask": building_mask,
        "buildingCellCount": sum(1 for row in building_mask for v in row if v),
    }
    with open(bldg_path, "w") as f:
        json.dump(bldg_data, f)
    size_kb = bldg_path.stat().st_size / 1024
    print(f"✓ Building mask written to {bldg_path}  ({size_kb:.0f} KB)")

    print("\nDone. Heightmap files ready for the web app.")


if __name__ == "__main__":
    main()
