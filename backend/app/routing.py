"""Bounded shortest-path search; directed edges, no inferred reverse trips."""
import heapq
import math

MODES = ("avion", "fleuve", "lac", "bac", "train", "bus", "voiture", "moto")
CRITERIA = {"rapide": "duree_h", "economique": "prix_min_usd", "court": "distance_km"}


def shortest_path(edges, start, end, criterion, allowed_modes, max_segments=6):
    """Return one feasible acyclic path (max 6 segments), or None.

    Costs are nonnegative. State keeps visited nodes to avoid cycles and honors
    segment limits; among feasible paths, the lowest additive cost is selected.
    """
    field = CRITERIA[criterion]
    graph = {}
    for edge in edges:
        if edge["mode"] not in allowed_modes:
            continue
        value = edge.get(field)
        if value is None:
            continue
        cost = float(value)
        if not math.isfinite(cost) or cost < 0:
            continue
        graph.setdefault(edge["depart_id"], []).append((edge, cost))

    queue = [(0.0, 0, start, (start,), ())]
    counter = 0
    while queue:
        cost, _, node, seen, path = heapq.heappop(queue)
        if node == end and path:
            return list(path)
        if len(path) >= max_segments:
            continue
        for edge, weight in graph.get(node, []):
            nxt = edge["arrivee_id"]
            if nxt in seen:
                continue
            counter += 1
            heapq.heappush(queue, (cost + weight, counter, nxt, seen + (nxt,), path + (edge,)))
    return None


def itineraries(edges, start, end, allowed_modes):
    out, seen_paths = [], set()
    for name in CRITERIA:
        path = shortest_path(edges, start, end, name, allowed_modes)
        if path is None:
            continue
        signature = tuple(edge["id"] for edge in path)
        if signature in seen_paths:
            continue
        seen_paths.add(signature)
        def total(field):
            return round(sum(float(e[field]) for e in path), 2) if all(e[field] is not None for e in path) else None
        out.append({
            "critere": name,
            "segments": path,
            "duree_h": total("duree_h"),
            "prix_min_usd": total("prix_min_usd"),
            "prix_max_usd": total("prix_max_usd"),
            "distance_km": total("distance_km"),
        })
    return out
