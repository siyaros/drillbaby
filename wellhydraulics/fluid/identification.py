"""
Multi-fluid identification along the flow path.

Tracks fluid boundaries (z2 array) and returns the correct mud type
and reference density at any depth position along the unfolded flow path.

Exact match to MATLAB ``FluidIdentification`` (lines 552-566).
"""

from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np
from numpy.typing import NDArray


@dataclass
class FluidTracker:
    """Tracks multiple fluid slugs along the wellbore.

    The "unfolded" coordinate runs 0 → BitDepth in the pipe, then
    BitDepth → 2*BitDepth in the annulus (from bottom to top).

    Attributes
    ----------
    density_ref : float
        Primary mud reference density [ppg].
    n_fluids : int
        Number of tracked fluid slugs (1 = single mud).
    z2 : list[float]
        Boundary positions in unfolded coordinate [ft].
    mud2 : list[int]
        Mud type index for each slug.
    dens2 : list[float]
        Reference density for each slug [ppg].
    """
    density_ref: float
    n_fluids: int = 1
    default_mud: int = 1  # active mud index for single-fluid case
    z2: list[float] = field(default_factory=lambda: [0.0] * 10)
    mud2: list[int] = field(default_factory=lambda: [0] * 10)
    dens2: list[float] = field(default_factory=lambda: [0.0] * 10)

    def identify(self, zz: float) -> tuple[int, float]:
        """Return (mud_index, density_ref) at position *zz* along the flow path."""
        mud = self.default_mud
        dref = self.density_ref

        if self.n_fluids > 1:
            for im in range(self.n_fluids - 2, -1, -1):
                if zz <= self.z2[im]:
                    mud = self.mud2[im]
                    dref = self.dens2[im]

        return mud, dref
