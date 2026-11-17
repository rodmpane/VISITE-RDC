"""Recherche de trajets multimodaux avec correspondances et statuts explicites."""
import heapq
import math

MODES = ("avion", "fleuve", "lac", "bac", "train", "bus", "voiture", "moto")
CRITERIA = {"rapide": "duree_h", "economique": "prix_min_usd", "court": "distance_km"}
ROAD = {"bus", "voiture", "moto"}


def _weight(edge, field):
    value = edge.get(field)
    if value is not None:
        try:
            number = float(value)
            if math.isfinite(number) and number >= 0:
                return number
        except (TypeError, ValueError):
            pass
    # Unknown price or time must never be interpreted as zero or invented.
    # Use a conservative search penalty, while output totals remain unknown.
    distance = edge.get("distance_km")
    km = float(distance) if distance is not None else 500.0
    if field == "duree_h":
        return max(1.0, km / 45.0) + 30.0
    if field == "prix_min_usd":
        return 1000.0 + km / 10.0
    return max(1.0, km)


def shortest_path(edges, start, end, criterion, allowed_modes, max_segments=12, banned_edges=frozenset()):
    field = CRITERIA[criterion]
    graph = {}
    for edge in edges:
        if edge["mode"] in allowed_modes and edge["id"] not in banned_edges:
            graph.setdefault(edge["depart_id"], []).append(edge)
    # Cost, number of transfers, unique index, city, visited cities, route
    queue = [(0.0, 0, 0, start, (start,), ())]
    counter = 0
    expansions = 0
    best = {}
    while queue and expansions < 3000:
        cost, _, _, city, seen, path = heapq.heappop(queue)
        expansions += 1
        state = (city, len(path))
        if cost > best.get(state, float("inf")):
            continue
        best[state] = cost
        if city == end and path:
            return list(path)
        if len(path) >= max_segments:
            continue
        for edge in graph.get(city, ()):
            nxt = edge["arrivee_id"]
            if nxt in seen:
                continue
            if cost + _weight(edge, field) >= best.get((nxt, len(path) + 1), float("inf")):
                continue
            counter += 1
            # A small transfer penalty favors understandable itineraries.
            penalty = 0.2 if path and path[-1]["mode"] != edge["mode"] else 0
            heapq.heappush(queue, (cost + _weight(edge, field) + penalty,
                                   len(path) + 1, counter, nxt, seen + (nxt,), path + (edge,)))
    return None


def itineraries(edges, start, end, allowed_modes):
    out, signatures = [], set()

    def add(path, criterion):
        if not path:
            return
        signature = tuple(str(edge["id"]) for edge in path)
        if signature in signatures:
            return
        signatures.add(signature)
        def total(field):
            values = [e.get(field) for e in path]
            return round(sum(float(v) for v in values), 2) if all(v is not None for v in values) else None
        out.append({
            "critere": criterion if not any(p["critere"] == criterion for p in out) else "alternative",
            "segments": path,
            "duree_h": total("duree_h"),
            "prix_min_usd": total("prix_min_usd"),
            "prix_max_usd": total("prix_max_usd"),
            "distance_km": total("distance_km"),
        })

    # Offer choices between all-road, air + road and direct air journeys.
    selections = [set(allowed_modes)]
    for mode in MODES:
        if mode in allowed_modes:
            selections.append({mode})
    for road in ROAD:
        if road in allowed_modes and "avion" in allowed_modes:
            selections.append({road, "avion"})
    for allowed in selections:
        for criterion in CRITERIA:
            add(shortest_path(edges, start, end, criterion, allowed), criterion)
            if len(out) >= 7:
                break
        if len(out) >= 7:
            break
    # Show alternative transfer hubs even when a different path scores better.
    for hub in ("kinshasa", "bunia", "kampala", "kisangani", "goma"):
        if hub in (start, end):
            continue
        for allowed in (set(allowed_modes), {"avion", "bus"} & set(allowed_modes)):
            first = shortest_path(edges, start, hub, "court", allowed)
            second = shortest_path(edges, hub, end, "court", allowed)
            if first and second and len(first) + len(second) <= 12:
                cities = [start] + [e["arrivee_id"] for e in first + second]
                if len(cities) == len(set(cities)):
                    add(first + second, "court")
            if len(out) >= 12:
                return out
    return out
