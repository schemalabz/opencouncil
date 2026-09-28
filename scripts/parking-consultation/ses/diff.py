"""Compare two manifests (id → summary) so a re-run on changed drawings shows what moved."""
from __future__ import annotations

import math
from pathlib import Path


def _distance(a: dict, b: dict) -> float:
    (ax, ay), (bx, by) = a["centroid"], b["centroid"]
    return math.hypot(ax - bx, ay - by)


def diff_manifests(old: dict, new: dict, moved_m: float = 3.0, length_tolerance: float = 0.15, rename_m: float = 20.0) -> dict:
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    moved = []
    for key in sorted(set(old) & set(new)):
        a, b = old[key], new[key]
        length_change = abs(a.get("lengthM", 0) - b.get("lengthM", 0)) / (a.get("lengthM") or 1)
        if _distance(a, b) > moved_m or length_change > length_tolerance:
            moved.append({"id": key, "distance_m": round(_distance(a, b), 1), "length_before": a.get("lengthM"), "length_after": b.get("lengthM")})
    renames = []
    for gone in removed:
        candidates = [
            key for key in added
            if new[key]["category"] == old[gone]["category"] and new[key].get("street") == old[gone].get("street") and _distance(old[gone], new[key]) <= rename_m
        ]
        if len(candidates) == 1:
            renames.append({"old": gone, "new": candidates[0]})
    return {"added": added, "removed": removed, "moved": moved, "renames": renames}


def write_report(diff: dict, path: Path, previous_name: str) -> None:
    lines = [f"# Changes against {previous_name}", ""]
    lines.append(f"- added: {len(diff['added'])}")
    lines.append(f"- removed: {len(diff['removed'])}")
    lines.append(f"- moved or resized: {len(diff['moved'])}")
    lines.append("")
    if diff["renames"]:
        lines += ["## Likely renames (paste into config/id-aliases.json to keep the old id)", "", "```json"]
        lines += [f'  "{r["new"]}": "{r["old"]}",' for r in diff["renames"]]
        lines += ["```", ""]
    for title, key in (("Added", "added"), ("Removed", "removed")):
        if diff[key]:
            lines += [f"## {title}", ""] + [f"- {value}" for value in diff[key]] + [""]
    if diff["moved"]:
        lines += ["## Moved or resized", ""] + [f"- {m['id']}: {m['distance_m']} m, length {m['length_before']} → {m['length_after']}" for m in diff["moved"]] + [""]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
