from app.routing import itineraries


def test_reverse_direction_requires_an_explicit_edge():
    edge = {"id": 1, "depart_id": "kin", "arrivee_id": "kis", "mode": "avion",
            "duree_h": 2, "prix_min_usd": 100, "prix_max_usd": 120, "distance_km": 1000}
    assert itineraries([edge], "kin", "kis", {"avion"})
    assert itineraries([edge], "kis", "kin", {"avion"}) == []
