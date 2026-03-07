"""
Interpolation utilities.

Provides the exact equivalent of MATLAB GridCharInterp (piece-wise
linear interpolation between junction depths onto the computational grid)
plus general-purpose numpy-backed interpolation helpers.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def grid_char_interp(
    z_grid: NDArray,
    z_junctions: NDArray,
    values: NDArray,
) -> NDArray:
    """Piece-wise linear interpolation of *values* defined at *z_junctions*
    onto the computational grid *z_grid*.

    This is the exact Python equivalent of MATLAB ``GridCharInterp``.

    Parameters
    ----------
    z_grid : (NZ,) array
        Computational grid node depths [ft], monotonically increasing.
    z_junctions : (M,) array
        Junction depths where *values* are known, increasing.
    values : (M,) array
        Property values at each junction.

    Returns
    -------
    result : (NZ,) array
        Interpolated property at every grid node.  Nodes outside the
        junction range are left at 0 (matching the MATLAB behaviour).
    """
    result = np.zeros_like(z_grid, dtype=np.float64)
    nj = len(z_junctions)
    for j, zj in enumerate(z_grid):
        for k in range(nj - 1):
            z_lo = z_junctions[k]
            z_hi = z_junctions[k + 1]
            if z_lo <= zj <= z_hi:
                denom = z_hi - z_lo
                if denom > 0:
                    result[j] = (values[k] * (z_hi - zj)
                                 + values[k + 1] * (zj - z_lo)) / denom
                else:
                    result[j] = values[k]
                break
    return result


def interp_1d(x: NDArray, xp: NDArray, fp: NDArray) -> NDArray:
    """Thin wrapper around ``np.interp`` with explicit signature."""
    return np.interp(x, xp, fp)


def remap_profile(
    z_new: NDArray,
    z_old: NDArray,
    profile: NDArray,
) -> NDArray:
    """Re-interpolate a full profile from an old grid to a new grid.

    Used when the computational grid changes (e.g. fluid boundary movement).
    """
    return np.interp(z_new, z_old, profile)
