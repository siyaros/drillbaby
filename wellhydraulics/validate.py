"""
Local validation: compare Python output (JSON) vs MATLAB output (XLSX).

Handles MATLAB files with missing columns gracefully.

Usage:
    python -m wellhydraulics.validate <matlab_output.xlsx> <python_output.json>
"""

import sys
import json
import numpy as np
import openpyxl


COL_MAP = {
    "MD": 0, "Incl": 1, "PID": 2, "rho_p": 3, "V_p": 4, "DSRe": 5,
    "ReTp": 6, "DSFric": 7, "P_p": 8, "Prp": 9, "Nup": 10, "HTCp": 11,
    "T_p": 12, "HID": 13, "POD": 14, "rho_a": 15, "V_a": 16, "AnRe": 17,
    "ReTa": 18, "AnFric": 19, "P_a": 20, "Pra": 21, "Nua": 22, "HTCa": 23,
    "T_a": 24, "T_f": 25, "B1p": 26, "B2p": 27, "B3p": 28, "B4p": 29,
    "B5p": 30, "B1a": 31, "B2a": 32, "B3a": 33, "B4a": 34, "B5a": 35,
    "B6a": 36, "GF": 37,
}


def sf(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_matlab(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Output"]
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        md = sf(r[0])
        if md is not None and any(sf(v) is not None and sf(v) != 0 for v in r[1:]):
            rows.append([sf(v) for v in r])
    wb.close()
    return rows


def load_python(path):
    with open(path) as f:
        data = json.load(f)
    return data["profiles"], data["scalars"]


def col_available(rows, col_idx):
    """Check if a column has real data (not all None/0)."""
    vals = [r[col_idx] for r in rows if col_idx < len(r)]
    return any(v is not None and v != 0 for v in vals)


def generate_report(m_rows, p_rows, p_scalars, out_path="validation_report.txt"):
    N = min(len(m_rows), len(p_rows))
    lines = []

    lines.append("=" * 80)
    lines.append("  WELLHYDRAULICS VALIDATION REPORT")
    lines.append("  MATLAB vs Python")
    lines.append("=" * 80)
    lines.append(f"\nGrid: MATLAB={len(m_rows)} nodes, Python={len(p_rows)} nodes")

    # Detect available columns
    avail = {}
    for name, col in COL_MAP.items():
        avail[name] = col_available(m_rows, col)
    
    missing = [n for n, a in avail.items() if not a]
    if missing:
        lines.append(f"\nWARNING: MATLAB file missing columns: {', '.join(missing)}")
        lines.append("  (Only available columns will be compared)\n")

    # ── SCALARS ──────────────────────────────────────────────────
    lines.append("SCALAR COMPARISON")
    lines.append("-" * 80)
    lines.append(f"{'Parameter':<22} {'MATLAB':>12} {'Python':>12} {'Diff':>10} {'Rel%':>8} {'':>6}")
    lines.append("-" * 80)

    s_pass = 0
    s_total = 0

    scalar_defs = [
        ("SPP [psi]",          "P_p",    0,  8,  "SPP",         10),
        ("BHP [psi]",          "P_a",   -1, 20,  "BHP",         10),
        ("DS Friction [psi]",  "DSFric",  0,  7,  "TotalDSFric", 10),
        ("An Friction [psi]",  "AnFric", -1, 19,  "TotalAnFric",  5),
        ("BHT [°F]",           "T_a",   -1, 24,  "BHT",         10),
    ]

    for name, req_col, row_idx, col_idx, pkey, tol in scalar_defs:
        if not avail.get(req_col, False):
            lines.append(f"{name:<22} {'N/A':>12} {p_scalars[pkey]:>12.2f} {'—':>10} {'—':>8} {'SKIP':>6}")
            continue
        mv = m_rows[row_idx][col_idx]
        if mv is None:
            lines.append(f"{name:<22} {'None':>12} {p_scalars[pkey]:>12.2f} {'—':>10} {'—':>8} {'SKIP':>6}")
            continue
        pv = p_scalars[pkey]
        diff = abs(mv - pv)
        rel = diff / max(abs(mv), 0.01) * 100
        ok = diff <= tol
        s_total += 1
        if ok:
            s_pass += 1
        lines.append(f"{name:<22} {mv:>12.2f} {pv:>12.2f} {diff:>10.2f} {rel:>7.3f}% {'PASS' if ok else 'FAIL':>6}")

    # NOTE: ECD and Bit Loss are NOT compared here because MATLAB does not
    # output them. The validate script only compares raw output values —
    # no derived quantities. ECD and BitLoss are reported by export_json
    # for informational purposes only.

    # ── PROFILE COMPARISON ───────────────────────────────────────
    lines.append(f"\nPROFILE COMPARISON (available columns only)")
    lines.append("-" * 80)
    lines.append(f"{'Parameter':<22} {'MaxAbsErr':>12} {'RMS_Rel%':>10} {'':>6}")
    lines.append("-" * 80)

    profile_params = [
        ("Annular Pressure",  "P_a",    20, "psi"),
        ("DS Pressure",       "P_p",     8, "psi"),
        ("Annular Friction",  "AnFric", 19, "psi"),
        ("DS Friction",       "DSFric",  7, "psi"),
        ("Annular Density",   "rho_a",  15, "ppg"),
        ("Pipe Density",      "rho_p",   3, "ppg"),
        ("Annular Velocity",  "V_a",    16, "fpm"),
        ("Pipe Velocity",     "V_p",     4, "fpm"),
        ("Pipe Temperature",  "T_p",    12, "°F"),
        ("Annular Temperature","T_a",   24, "°F"),
        ("Nusselt Pipe",      "Nup",    10, "-"),
        ("Nusselt Annulus",   "Nua",    22, "-"),
        ("GF",                "GF",     37, "-"),
    ]

    for label, col_name, col_idx, unit in profile_params:
        if not avail.get(col_name, False):
            lines.append(f"{label+' ['+unit+']':<22} {'— N/A —':>12} {'—':>10} {'SKIP':>6}")
            continue
        errs = []
        rels = []
        for i in range(N):
            mv = m_rows[i][col_idx]
            pv = p_rows[i][col_idx]
            if mv is None:
                continue
            ae = abs(mv - pv)
            errs.append(ae)
            rels.append((ae / max(abs(mv), 0.01)) ** 2)
        if errs:
            mx = max(errs)
            rms = np.sqrt(np.mean(rels)) * 100
            lines.append(f"{label+' ['+unit+']':<22} {mx:>12.4f} {rms:>9.4f}% {'':>6}")
        else:
            lines.append(f"{label+' ['+unit+']':<22} {'no data':>12} {'—':>10} {'SKIP':>6}")

    # ── NODE TABLE ───────────────────────────────────────────────
    # Build table with available columns
    lines.append(f"\nNODE-BY-NODE DATA")
    lines.append("-" * 90)

    # Determine which columns to show
    show_cols = []
    for label, col_name, col_idx in [
        ("Pa", "P_a", 20), ("Pp", "P_p", 8), ("Tp", "T_p", 12),
        ("Ta", "T_a", 24), ("AnFric", "AnFric", 19), ("Va", "V_a", 16),
    ]:
        if avail.get(col_name, False):
            show_cols.append((label, col_idx))

    header = f"{'MD':>6}"
    for label, _ in show_cols:
        header += f" | {label+'_M':>8} {label+'_P':>8} {'d'+label:>6}"
    lines.append(header)
    lines.append("-" * len(header))

    indices = list(range(0, N, 5))
    if N - 1 not in indices:
        indices.append(N - 1)

    for i in indices:
        mr, pr = m_rows[i], p_rows[i]
        md = mr[0] if mr[0] is not None else 0
        row_str = f"{md:>6.0f}"
        for label, col_idx in show_cols:
            mv = mr[col_idx]
            pv = pr[col_idx]
            if mv is not None:
                row_str += f" | {mv:>8.1f} {pv:>8.1f} {abs(mv-pv):>6.1f}"
            else:
                row_str += f" | {'—':>8} {pv:>8.1f} {'—':>6}"
        lines.append(row_str)

    lines.append(f"\n{'='*80}")
    lines.append(f"  Scalars: {s_pass}/{s_total} PASS")
    lines.append(f"{'='*80}")

    report = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(report)
    print(f"\nReport saved to: {out_path}")


def generate_plots(m_rows, p_rows, out_path="validation_plots.png"):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed. Run: pip install matplotlib")
        return

    N = min(len(m_rows), len(p_rows))
    m_md = np.array([m_rows[i][0] if m_rows[i][0] is not None else 0 for i in range(N)])
    p_md = np.array([p_rows[i][0] for i in range(N)])

    plot_defs = [
        ("Annular Pressure [psi]", 20),
        ("DS Pressure [psi]", 8),
        ("Annular Friction [psi]", 19),
        ("DS Friction [psi]", 7),
        ("Pipe Temperature [°F]", 12),
        ("Annular Temperature [°F]", 24),
        ("Annular Velocity [fpm]", 16),
        ("Pipe Velocity [fpm]", 4),
        ("Annular Density [ppg]", 15),
        ("Pipe Density [ppg]", 3),
        ("Nusselt Pipe", 10),
        ("GF", 37),
    ]

    # Filter to only plot columns that have MATLAB data
    avail_plots = []
    for label, col in plot_defs:
        if any(m_rows[i][col] is not None for i in range(N)):
            avail_plots.append((label, col))

    if not avail_plots:
        print("No overlapping data columns to plot.")
        return

    n_plots = len(avail_plots)
    n_cols = min(3, n_plots)
    n_rows_fig = (n_plots + n_cols - 1) // n_cols
    fig, axes = plt.subplots(n_rows_fig, n_cols, figsize=(6 * n_cols, 4 * n_rows_fig))
    if n_plots == 1:
        axes = [axes]
    else:
        axes = axes.flatten()

    fig.suptitle("MATLAB vs Python — Depth Profiles", fontsize=14, fontweight="bold", y=0.99)

    for idx, (label, col) in enumerate(avail_plots):
        ax = axes[idx]
        m_vals = []
        p_vals = []
        md_vals = []
        for i in range(N):
            mv = m_rows[i][col]
            if mv is not None:
                m_vals.append(mv)
                p_vals.append(p_rows[i][col])
                md_vals.append(m_md[i])

        m_vals = np.array(m_vals)
        p_vals = np.array(p_vals)
        md_vals = np.array(md_vals)

        ax.plot(m_vals, md_vals, "o-", color="#e6960c", markersize=2, linewidth=1.5, label="MATLAB")
        ax.plot(p_vals, md_vals, "s--", color="#2196F3", markersize=2, linewidth=1.5, label="Python")
        ax.set_ylabel("MD [ft]")
        ax.set_xlabel(label)
        ax.set_title(label, fontsize=10, fontweight="bold")
        ax.invert_yaxis()
        ax.legend(fontsize=8)
        ax.grid(True, alpha=0.3)

    for idx in range(len(avail_plots), len(axes)):
        axes[idx].set_visible(False)

    plt.tight_layout(rect=[0, 0, 1, 0.97])
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    print(f"Plots saved to: {out_path}")
    plt.close()

    # Error plots for available key parameters
    err_params = [p for p in [
        ("Annular Pressure Error [psi]", 20, "#e74c3c"),
        ("Annular Friction Error [psi]", 19, "#e67e22"),
        ("Pipe Temperature Error [°F]", 12, "#9b59b6"),
        ("Annular Temperature Error [°F]", 24, "#2980b9"),
    ] if any(m_rows[i][p[1]] is not None for i in range(N))]

    if err_params:
        fig2, axes2 = plt.subplots(1, len(err_params), figsize=(5 * len(err_params), 4))
        if len(err_params) == 1:
            axes2 = [axes2]
        fig2.suptitle("Absolute Error Profiles", fontsize=12, fontweight="bold")

        for ax, (label, col, color) in zip(axes2, err_params):
            md_e, err_e = [], []
            for i in range(N):
                mv = m_rows[i][col]
                if mv is not None:
                    md_e.append(m_md[i])
                    err_e.append(abs(mv - p_rows[i][col]))
            md_e, err_e = np.array(md_e), np.array(err_e)
            ax.plot(md_e, err_e, "o-", color=color, markersize=3, linewidth=1.5)
            ax.fill_between(md_e, 0, err_e, alpha=0.2, color=color)
            ax.set_xlabel("MD [ft]")
            ax.set_ylabel("Abs Error")
            ax.set_title(label, fontsize=9, fontweight="bold")
            ax.grid(True, alpha=0.3)
            if len(err_e) > 0:
                ax.annotate(f"Max: {err_e.max():.2f}", xy=(0.98, 0.95),
                            xycoords="axes fraction", ha="right", va="top",
                            fontsize=9, fontweight="bold", color=color)

        plt.tight_layout()
        err_path = out_path.replace(".png", "_errors.png")
        plt.savefig(err_path, dpi=150, bbox_inches="tight")
        print(f"Error plots saved to: {err_path}")
        plt.close()


def main():
    if len(sys.argv) < 3:
        print("Usage: python -m wellhydraulics.validate <matlab_output.xlsx> <python_output.json>")
        sys.exit(1)

    matlab_path = sys.argv[1]
    python_path = sys.argv[2]

    print(f"Loading MATLAB output: {matlab_path}")
    m_rows = load_matlab(matlab_path)
    print(f"  -> {len(m_rows)} nodes")

    print(f"Loading Python output: {python_path}")
    p_rows, p_scalars = load_python(python_path)
    print(f"  -> {len(p_rows)} nodes\n")

    if len(m_rows) == 0:
        print("ERROR: No valid data rows found in MATLAB file.")
        print("Check that the 'Output' sheet has numerical data starting in row 2.")
        sys.exit(1)

    generate_report(m_rows, p_rows, p_scalars)
    generate_plots(m_rows, p_rows)


if __name__ == "__main__":
    main()
