"""
Low-level numerical routines.

* Bisection root finder (used for Dranchuk Z-factor)
* Clamping / safeguard helpers
* NaN detection
"""

from __future__ import annotations

import math
import logging
from typing import Callable

logger = logging.getLogger(__name__)


def bisection(
    func: Callable[[float], float],
    a: float,
    b: float,
    max_iter: int = 20,
    tol: float = 0.0,
) -> float:
    """Bisection root finder on ``func`` over [a, b].

    Parameters
    ----------
    func : callable
        Scalar function f(x); root is where f crosses zero.
    a, b : float
        Bracket bounds.  f(a) and f(b) should have opposite signs,
        but the MATLAB code simply checks the sign of f(midpoint)
        without an initial sign check, so we replicate that.
    max_iter : int
        Number of bisection iterations (MATLAB uses 20).
    tol : float
        Early exit if |b - a| < tol.  Default 0 means run all iterations.

    Returns
    -------
    midpoint : float
        Approximate root after *max_iter* iterations.
    """
    for _ in range(max_iter):
        mid = 0.5 * (a + b)
        if tol > 0 and abs(b - a) < tol:
            return mid
        fval = func(mid)
        if fval < 0.0:
            a = mid
        else:
            b = mid
    return 0.5 * (a + b)


def safe_exp(x: float, clip: float = 500.0) -> float:
    """``exp(x)`` with argument clamped to [-clip, clip] to prevent overflow."""
    return math.exp(max(-clip, min(clip, x)))


def safe_log10(x: float, floor: float = 1e-30) -> float:
    """``log10(x)`` with x floored to prevent -inf / domain error."""
    return math.log10(max(floor, x))


def safe_power(base: float, exp: float) -> float:
    """``base ** exp`` with protection against negative base for fractional exp."""
    if base < 0 and exp != int(exp):
        logger.warning("Negative base %.6g with fractional exponent %.6g", base, exp)
        return 0.0
    try:
        return base ** exp
    except (OverflowError, ValueError):
        logger.warning("Overflow in %.6g ** %.6g", base, exp)
        return 1e30


def check_nan(*arrays) -> bool:
    """Return True if any value is NaN in the given arrays/scalars."""
    import numpy as np
    for a in arrays:
        arr = np.asarray(a)
        if np.any(np.isnan(arr)):
            return True
    return False
