"""Authenticated creation, editing, publication and removal of itinerary links."""
from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from .db import connection, execute, fetchone, fetchall, is_sqlite
from .catalogue import admin_auth

def require_admin(authorization: str | None = Header(default=None)):
    admin_auth(authorization)

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])

class LiaisonRecord(BaseModel):
    mode: Literal["avion","fleuve","lac","bac","train","bus","voiture","moto"]
    depart_id: str = Field(min_length=1, max_length=100)
    arrivee_id: str = Field(min_length=1, max_length=100)
    operateur: str = Field(default="", max_length=180)
    frequence: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=1000)
    duree_h: float | None = Field(default=None, gt=0)
    prix_min_usd: float | None = Field(default=None, ge=0)
    prix_max_usd: float | None = Field(default=None, ge=0)
    statut: Literal["ok","a_verifier","suspendu"] = "a_verifier"
    publie: bool = False
    verifie_le: date | None = None
    source_info: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def check(self):
        if self.depart_id == self.arrivee_id:
            raise ValueError("Le départ et l'arrivée doivent être différents.")
        if self.prix_min_usd is not None and self.prix_max_usd is not None and self.prix_max_usd < self.prix_min_usd:
            raise ValueError("Prix maximum inférieur au prix minimum.")
        if self.verifie_le and self.verifie_le > date.today():
            raise ValueError("La vérification ne peut pas être dans le futur.")
        if self.publie and (self.statut != "ok" or not self.source_info.strip() or not self.verifie_le):
            raise ValueError("Publication : statut OK, source et date de vérification obligatoires.")
        return self

def validate_places(conn, body):
    for place in (body.depart_id,body.arrivee_id):
        if not fetchone(conn,"SELECT id FROM lieux WHERE id=?",(place,)):
            raise HTTPException(status_code=422,detail=f"Ville inconnue : {place}")
    if body.operateur:
        from .catalogue import init_catalogue, TRANSPORTEURS_PROPOSES
        init_catalogue(conn)
        partner=fetchone(conn,"SELECT id FROM catalogue_partenaires WHERE categorie='transporteur' AND nom=?",(body.operateur,))
        legacy=fetchone(conn,"SELECT id FROM operateurs WHERE nom=?",(body.operateur,))
        if not partner and not legacy and body.operateur.casefold() not in {name.casefold() for name in TRANSPORTEURS_PROPOSES}:
            raise HTTPException(status_code=422,detail="Choisissez une compagnie enregistrée dans le catalogue.")

def as_data(body):
    data=body.model_dump(mode="json")
    data["publie"]=int(body.publie)
    return data

@router.post("/liaisons",status_code=201)
def create_liaison(body:LiaisonRecord):
    with connection() as conn:
        validate_places(conn,body)
        data=as_data(body)
        keys=list(data)
        cursor=execute(conn,f"INSERT INTO liaisons ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)}) RETURNING id",[data[k] for k in keys])
        inserted=cursor.fetchone()
        new_id=inserted[0] if is_sqlite() else inserted["id"]
        return fetchone(conn,"SELECT * FROM liaisons WHERE id=?",(new_id,))

@router.put("/liaisons/{liaison_id}")
def replace_liaison(liaison_id:int,body:LiaisonRecord):
    with connection() as conn:
        if not fetchone(conn,"SELECT id FROM liaisons WHERE id=?",(liaison_id,)):
            raise HTTPException(status_code=404,detail="Liaison introuvable")
        existing=fetchone(conn,"SELECT operateur FROM liaisons WHERE id=?",(liaison_id,))
        # Existing legacy operator names remain editable without forcing a catalogue migration.
        if existing and existing["operateur"] == body.operateur:
            validate_places(conn,body.model_copy(update={"operateur":""}))
        else:
            validate_places(conn,body)
        data=as_data(body)
        keys=list(data)
        execute(conn,f"UPDATE liaisons SET {','.join(k+'=?' for k in keys)} WHERE id=?",[data[k] for k in keys]+[liaison_id])
        return fetchone(conn,"SELECT * FROM liaisons WHERE id=?",(liaison_id,))

@router.delete("/liaisons/{liaison_id}")
def delete_liaison(liaison_id:int):
    with connection() as conn:
        existing=fetchone(conn,"SELECT id FROM liaisons WHERE id=?",(liaison_id,))
        if not existing:
            raise HTTPException(status_code=404,detail="Liaison introuvable")
        execute(conn,"DELETE FROM liaisons WHERE id=?",(liaison_id,))
        return {"deleted":True}

class LiaisonCompany(BaseModel):
    operateur: str = Field(min_length=2,max_length=180)
    prix_min_usd: float | None = Field(default=None,ge=0)
    prix_max_usd: float | None = Field(default=None,ge=0)

class LiaisonMultiple(BaseModel):
    liaison: LiaisonRecord
    compagnies: list[LiaisonCompany] = Field(min_length=1,max_length=30)

@router.post("/liaisons/multiples",status_code=201)
def create_multiple_liaisons(body:LiaisonMultiple):
    """Create one route per operator atomically; each retains its own price range."""
    names=[c.operateur.strip().casefold() for c in body.compagnies]
    if len(set(names))!=len(names):
        raise HTTPException(status_code=422,detail="Une compagnie ne peut figurer qu'une fois par itinéraire.")
    with connection() as conn:
        created=[]
        for company in body.compagnies:
            row=body.liaison.model_copy(update={"operateur":company.operateur.strip(),
                "prix_min_usd":company.prix_min_usd,"prix_max_usd":company.prix_max_usd})
            # model_copy does not revalidate updated values; validate explicitly.
            row=LiaisonRecord.model_validate(row.model_dump())
            validate_places(conn,row)
            data=as_data(row)
            keys=list(data)
            cursor=execute(conn,f"INSERT INTO liaisons ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)}) RETURNING id",[data[k] for k in keys])
            inserted=cursor.fetchone()
            new_id=inserted[0] if is_sqlite() else inserted["id"]
            created.append(fetchone(conn,"SELECT * FROM liaisons WHERE id=?",(new_id,)))
        return {"created":created,"count":len(created)}
