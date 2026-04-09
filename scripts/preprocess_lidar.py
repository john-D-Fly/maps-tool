#!/usr/bin/env python3
"""
Download LiDAR point cloud data from the USGS EPT endpoint for Alachua County
(FL Peninsular FDEM 2018) and generate DSM / building-mask heightmap JSONs
for the UF campus area.

The key optimization is using the EPT reader's `bounds` parameter in the
native CRS (EPSG:6440 — NAD83(2011) / Florida North ftUS) so that only the
relevant octree nodes are fetched from S3, not the entire county.

Usage:
    conda activate lidar
    python scripts/preprocess_lidar.py

Output:
    public/lidar/uf-campus.json            – DSM heightmap (ground + buildings)
    public/lidar/uf-campus-buildings.json   – boolean building mask
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

try:
    import pdal
except ImportError:
    sys.exit(
        "PDAL Python bindings not found.\n"
        "Install via conda:  conda install -c conda-forge python-pdal pdal\n"
    )

# ── Configuration ───────────────────────────────────────────────────────────

EPT_URL = (
    "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/"
    "FL_Peninsular_FDEM_Alachua_2018/ept.json"
)

# UF campus bounding box (WGS84 — tighter area focused on campus core)
SOUTH, NORTH = 29.636, 29.658
WEST, EAST = -82.370, -82.335

RESOLUTION_M = 5

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "lidar"

# ── Coordinate conversion WGS84 → EPSG:6440 (Florida North ftUS) ──────────
# The EPT dataset is in EPSG:6440. We need bounds in that CRS for efficient
# server-side filtering. Using the PDAL reprojection approach: we first
# compute approximate bounds in EPSG:6440 using a small point query, then
# use those bounds to read only the relevant tiles.

def _wgs84_bbox_to_ept_bounds_string(
    south: float, north: float, west: float, east: float,
) -> str:
    """Convert WGS84 bbox to an EPT-reader `bounds` string in EPSG:3857
    (Web Mercator), which is the native CRS of the USGS Alachua EPT dataset."""
    try:
        from pyproj import Transformer  # type: ignore[import-untyped]
        tx = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        x_min, y_min = tx.transform(west, south)
        x_max, y_max = tx.transform(east, north)
        return f"([{x_min}, {x_max}], [{y_min}, {y_max}])"
    except ImportError:
        pass

    # Fallback: approximate Web Mercator conversion
    import math as _m
    def _to_3857(lng: float, lat: float) -> tuple[float, float]:
        x = lng * 20037508.34 / 180.0
        y = _m.log(_m.tan((_m.pi / 4) + (_m.radians(lat) / 2))) * 20037508.34 / _m.pi
        return x, y

    x_min, y_min = _to_3857(west, south)
    x_max, y_max = _to_3857(east, north)
    return f"([{x_min}, {x_max}], [{y_min}, {y_max}])"


def _grid_shape(south: float, north: float, west: float, east: float,
                res_m: float) -> tuple[int, int]:
    lat_span_m = (north - south) * 111_320
    mid_lat = math.radians((north + south) / 2)
    lng_span_m = (east - west) * 111_320 * math.cos(mid_lat)
    rows = max(1, int(round(lat_span_m / res_m)))
    cols = max(1, int(round(lng_span_m / res_m)))
    return rows, cols


def _rasterize_vectorized(
    xs: np.ndarray, ys: np.ndarray, zs: np.ndarray,
    south: float, north: float, west: float, east: float,
    rows: int, cols: int,
) -> np.ndarray:
    """Vectorized rasterization: max Z per cell using numpy. Much faster
    than a Python for-loop for millions of points."""
    grid = np.full((rows, cols), np.nan, dtype=np.float32)

    col_idx = np.clip(
        ((xs - west) / (east - west) * cols).astype(np.int32), 0, cols - 1
    )
    row_idx = np.clip(
        ((north - ys) / (north - south) * rows).astype(np.int32), 0, rows - 1
    )

    flat_idx = row_idx * cols + col_idx
    order = np.argsort(zs)
    for i in order:
        grid.ravel()[flat_idx[i]] = zs[i]

    return grid


def _fill_nans(grid: np.ndarray) -> np.ndarray:
    try:
        from scipy.ndimage import distance_transform_edt
        mask = np.isnan(grid)
        if not mask.any():
            return grid
        ind = distance_transform_edt(mask, return_distances=False, return_indices=True)
        return grid[tuple(ind)]
    except ImportError:
        result = grid.copy()
        mask = np.isnan(result)
        if mask.any():
            result[mask] = np.nanmean(result)
        return result


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows, cols = _grid_shape(SOUTH, NORTH, WEST, EAST, RESOLUTION_M)
    print(f"Grid size: {rows} rows × {cols} cols  ({rows * cols:,} cells)")
    print(f"Bounds (WGS84): N={NORTH} S={SOUTH} E={EAST} W={WEST}")
    print(f"Resolution: {RESOLUTION_M}m\n")

    ept_bounds = _wgs84_bbox_to_ept_bounds_string(SOUTH, NORTH, WEST, EAST)
    print(f"EPT bounds (EPSG:3857): {ept_bounds}")

    crop_wkt = (
        f"POLYGON(({WEST} {SOUTH}, {EAST} {SOUTH}, {EAST} {NORTH}, "
        f"{WEST} {NORTH}, {WEST} {SOUTH}))"
    )

    pipeline_json = json.dumps({
        "pipeline": [
            {
                "type": "readers.ept",
                "filename": EPT_URL,
                "bounds": ept_bounds,
                "threads": 4,
            },
            {
                "type": "filters.range",
                "limits": "Classification[2:2],Classification[6:6]",
            },
            {
                "type": "filters.reprojection",
                "in_srs": "EPSG:3857",
                "out_srs": "EPSG:4326",
            },
            {
                "type": "filters.crop",
                "polygon": crop_wkt,
            },
        ]
    })

    print("Running PDAL pipeline (EPT with bounds filter — should be fast)…")
    pipeline = pdal.Pipeline(pipeline_json)
    n_points = pipeline.execute()
    print(f"Retrieved {n_points:,} points\n")

    if n_points == 0:
        sys.exit("No points returned. Check bounds / EPT URL.")

    pts = pipeline.arrays[0]
    x, y, z = pts["X"], pts["Y"], pts["Z"]
    classification = pts["Classification"]

    print(f"X range: {x.min():.6f} – {x.max():.6f}")
    print(f"Y range: {y.min():.6f} – {y.max():.6f}")
    print(f"Z range: {z.min():.2f} – {z.max():.2f} m")

    cls_unique, cls_counts = np.unique(classification, return_counts=True)
    for c, n in zip(cls_unique, cls_counts):
        print(f"  Class {c}: {n:,} points")

    # ── DSM (ground + buildings) ────────────────────────────────────────────
    print("\nRasterizing DSM (ground + buildings)…")
    dsm = _rasterize_vectorized(x, y, z, SOUTH, NORTH, WEST, EAST, rows, cols)
    nan_pct = np.isnan(dsm).sum() / dsm.size * 100
    print(f"  NaN cells: {nan_pct:.1f}%")
    dsm = _fill_nans(dsm)

    # ── Building mask ───────────────────────────────────────────────────────
    print("Generating building mask…")
    bldg_mask_arr = (classification == 6)
    bldg_grid = _rasterize_vectorized(
        x[bldg_mask_arr], y[bldg_mask_arr], z[bldg_mask_arr],
        SOUTH, NORTH, WEST, EAST, rows, cols,
    )
    building_mask = (~np.isnan(bldg_grid)).astype(np.uint8)

    # ── Write DSM JSON ──────────────────────────────────────────────────────
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

    # ── Write building mask JSON ────────────────────────────────────────────
    bldg_path = OUT_DIR / "uf-campus-buildings.json"
    bldg_data = {
        "bounds": {"north": NORTH, "south": SOUTH, "east": EAST, "west": WEST},
        "rows": rows,
        "cols": cols,
        "mask": building_mask.reshape(rows, cols).tolist(),
        "buildingCellCount": int(building_mask.sum()),
    }
    with open(bldg_path, "w") as f:
        json.dump(bldg_data, f)
    size_kb = bldg_path.stat().st_size / 1024
    print(f"✓ Building mask written to {bldg_path}  ({size_kb:.0f} KB)")

    print("\nDone. Heightmap files ready for the web app.")


if __name__ == "__main__":
    main()
