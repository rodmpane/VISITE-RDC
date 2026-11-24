from app.db import connection, fetchall, execute
import unicodedata
def key(s):
    return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if c.isalnum() and not unicodedata.combining(c))
ROWS = [
 ('kinshasa','bandundu','Lundi à samedi : 07:30 - 08:30',1),
 ('bandundu','nioki','Lundi, mercredi, vendredi : 09:00 - 09:15',0.25),
 ('nioki','kinshasa','Lundi, mercredi, vendredi : 09:30 - 10:30',1),
 ('bandundu','kinshasa','Mardi, jeudi, samedi : 08:45 - 09:45',1),
]
def main():
    with connection() as conn:
        places={}
        for p in fetchall(conn,'SELECT id,nom FROM lieux'):
            for v in (p['id'],p['nom']):
                places[key(v)]=p['id']
        places.setdefault('bandundu',places.get('bandunduville'))
        for a,b,freq,duration in ROWS:
            x,y=places.get(a),places.get(b)
            if not x or not y:
                print('Kinavia: ville manquante',a,b)
                continue
            existing=fetchall(conn,"SELECT id FROM liaisons WHERE depart_id=? AND arrivee_id=? AND mode='avion' AND LOWER(REPLACE(TRIM(operateur),' ',''))='kinavia'",(x,y))
            if existing:
                for r in existing:
                    execute(conn,"UPDATE liaisons SET frequence=?, duree_h=? WHERE id=?",(freq,duration,r['id']))
            else:
                execute(conn,"INSERT INTO liaisons (mode,depart_id,arrivee_id,operateur,frequence,duree_h,statut,publie,source_info) VALUES (?,?,?,?,?,?,?,?,?)",('avion',x,y,'Kin Avia',freq,duration,'a_verifier',0,'Capture horaire fournie; date non précisée'))
if __name__=='__main__':
    main()
