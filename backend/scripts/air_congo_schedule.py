from app.db import connection, fetchall, execute
import unicodedata

ROWS = [["Kinshasa","Lubumbashi","Tous les jours","08:00 - 11:30"],["Lubumbashi","Kinshasa","Tous les jours","12:10 - 11:30 (à vérifier)"],["Kinshasa","Lubumbashi","Tous les jours","15:00 - 11:30 (à vérifier)"],["Lubumbashi","Kinshasa","Tous les jours","19:10 - 20:40"],["Kinshasa","Mbuji Mayi","Lundi & Mercredi","08:00 - 10:40"],["Mbuji Mayi","Lubumbashi","Lundi & Mercredi","11:20 - 12:50"],["Lubumbashi","Mbuji Mayi","Lundi & Mercredi","13:30 - 15:00"],["Mbuji Mayi","Kinshasa","Lundi & Mercredi","15:40 - 16:20"],["Kinshasa","Kisangani","Dimanche","08:00 - 11:00"],["Kisangani","Kindu","Dimanche","11:45 - 12:45"],["Kindu","Kinshasa","Dimanche","13:20 - 14:20"],["Kinshasa","Kindu","Vendredi","08:00 - 11:00"],["Kindu","Kisangani","Vendredi","11:40 - 12:45"],["Kisangani","Kinshasa","Vendredi","13:20 - 14:20"],["Kinshasa","Gemena","Mardi & Samedi","08:00 - 09:50"],["Gemena","Kinshasa","Mardi & Samedi","10:30 - 12:20"],["Kinshasa","Kananga","Jeudi","08:00 - 10:30"],["Kananga","Kalemie","Jeudi","11:00 - 12:30"],["Kalemie","Kananga","Jeudi","13:20 - 14:50"],["Kananga","Kinshasa","Jeudi","15:30 - 16:00"],["Kinshasa","Mbandaka","Mardi & Samedi","13:30 - 14:50"],["Mbandaka","Kinshasa","Mardi & Samedi","15:30 - 16:50"]]

def key(s):
    return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if c.isalnum() and not unicodedata.combining(c))

def main():
    with connection() as conn:
        places={key(p['nom']):p['id'] for p in fetchall(conn,'SELECT id,nom FROM lieux')}
        grouped={}
        for a,b,d,h in ROWS:
            grouped.setdefault((a,b),[]).append(d+' : '+h)
        for (a,b),slots in grouped.items():
            x,y=places.get(key(a)),places.get(key(b))
            if not x or not y:
                print('Air Congo: ville manquante',a,b)
                continue
            frequency=' ; '.join(slots)
            existing=fetchall(conn,"SELECT id FROM liaisons WHERE depart_id=? AND arrivee_id=? AND mode='avion' AND LOWER(TRIM(operateur))='air congo'",(x,y))
            if existing:
                for row in existing:
                    execute(conn,'UPDATE liaisons SET frequence=? WHERE id=? AND COALESCE(frequence,\'\')=\'\'',(frequency,row['id']))
            else:
                execute(conn,"INSERT INTO liaisons (mode,depart_id,arrivee_id,operateur,frequence,statut,publie,source_info) VALUES (?,?,?,?,?,?,?,?)",('avion',x,y,'Air Congo',frequency,'a_verifier',0,'Document horaires Air Congo fourni, validité à confirmer'))

if __name__=='__main__':
    main()
