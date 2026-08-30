#!/usr/bin/env python3
"""Génère automatiquement le bilan Footix d'une journée Ligue 1 terminée.

- Calcule les bons pronostics 1/N/2 depuis schedule.json + pronos.json.
- Calcule les buteurs trouvés uniquement lorsque BSD a validé actualScorers.
- Génère gratuitement le résumé avec un moteur local Footix lorsque tous les matchs de la journée
  sont terminés et que les données buteurs sont disponibles.
- Ne régénère pas un bilan IA déjà créé sauf FORCE_REVIEW=1.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCHEDULE = ROOT / "schedule.json"
PRONOS = ROOT / "pronos.json"
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://brjwujgtkyxzyytkwftw.supabase.co").rstrip("/")
REVIEW_MODEL = "Footix Premium v10.0.6"

def norm(value):
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

def result_pick(fixture):
    if not fixture.get("completed"):
        return None
    try:
        h, a = int(fixture["homeScore"]), int(fixture["awayScore"])
    except (KeyError, TypeError, ValueError):
        return None
    return "1" if h > a else "2" if a > h else "N"

def predicted_scorers(p):
    vals = p.get("scorers")
    if isinstance(vals, list):
        return [str(x).strip() for x in vals if str(x).strip()][:4]
    return [x.strip() for x in re.split(r"[\n,;]+", str(p.get("buteurs") or "")) if x.strip()][:4]

def scorer_hit(predicted, actual):
    """Compare un nom Footix complet avec les noms BSD, souvent abrégés.

    Exemples acceptés :
    - "Florian Thauvin" <-> "F. Thauvin"
    - "Amine El Ouazzani" <-> "A. E. Ouazzani"
    - "Lassine Sinayoko" <-> "L. Sinayoko"

    On exige toujours le même nom de famille et, lorsqu'elles sont disponibles,
    des initiales compatibles afin d'éviter les faux positifs.
    """
    p = norm(predicted)
    if not p:
        return False
    p_parts = p.split()
    if not p_parts:
        return False

    p_last = p_parts[-1]
    p_initials = [x[0] for x in p_parts[:-1] if x]

    for scorer in actual:
        a = norm(scorer)
        if not a:
            continue
        if a == p:
            return True

        a_parts = a.split()
        if not a_parts:
            continue

        # Le nom de famille doit correspondre.
        if a_parts[-1] != p_last:
            continue

        # Un prono saisi uniquement avec le nom de famille reste accepté
        # si celui-ci est suffisamment distinctif.
        if len(p_parts) == 1:
            if len(p_last) >= 4:
                return True
            continue

        # BSD abrège souvent les prénoms en initiales après normalisation :
        # "A. E. Ouazzani" devient ["a", "e", "ouazzani"].
        a_initials = [x[0] for x in a_parts[:-1] if x]
        if not a_initials:
            # BSD n'a fourni que le nom de famille.
            return len(p_last) >= 4

        # Les initiales BSD doivent correspondre au début des prénoms Footix.
        if len(a_initials) <= len(p_initials) and all(
            ai == pi for ai, pi in zip(a_initials, p_initials)
        ):
            return True

    return False

def prono_for(day, home, away):
    return day.get(f"{home}|||{away}") or day.get(f"{home} - {away}") or {}



def supabase_get(path, params):
    """GET REST Supabase côté GitHub Actions avec la service_role (jamais côté navigateur)."""
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_role:
        return None

    from urllib.parse import urlencode

    query = urlencode(params, doseq=True, safe="(),.*")
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if query:
        url += "?" + query

    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_role,
            "Authorization": f"Bearer {service_role}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as exc:
        print(f"[WARN] Supabase communauté indisponible: {exc}")
        return None


def community_success(day_no, fixtures=None):
    """Taux réel communauté d'une journée L1, basé sur les résultats déjà synchronisés dans Supabase."""
    rows = supabase_get(
        "matches",
        {
            "select": "id,result_pick,status",
            "competition": "eq.L1",
            "matchday": f"eq.{day_no}",
            "result_pick": "not.is.null",
        },
    )
    if not isinstance(rows, list) or not rows:
        print(f"[INFO] J{day_no}: aucun résultat Supabase exploitable pour la communauté.")
        return None

    match_results = {}
    for row in rows:
        try:
            match_id = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        actual = str(row.get("result_pick") or "").upper().strip()
        if actual in {"1", "N", "2"}:
            match_results[match_id] = actual

    if not match_results:
        print(f"[INFO] J{day_no}: result_pick absent/invalide dans Supabase.")
        return None

    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_role:
        print("[WARN] SUPABASE_SERVICE_ROLE_KEY absente : statistiques communauté ignorées.")
        return None

    ids = ",".join(str(x) for x in sorted(match_results))

    from urllib.parse import urlencode
    all_predictions = []
    start_row = 0
    page_size = 1000

    while True:
        params = {
            "select": "pick,match_id",
            "match_id": f"in.({ids})",
        }
        url = f"{SUPABASE_URL}/rest/v1/predictions?" + urlencode(params, safe="(),.*")
        req = urllib.request.Request(
            url,
            headers={
                "apikey": service_role,
                "Authorization": f"Bearer {service_role}",
                "Accept": "application/json",
                "Range": f"{start_row}-{start_row + page_size - 1}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                page = json.loads(r.read().decode("utf-8"))
        except Exception as exc:
            print(f"[WARN] Lecture pronostics communauté impossible: {exc}")
            return None

        if not isinstance(page, list):
            return None

        all_predictions.extend(page)
        if len(page) < page_size:
            break
        start_row += page_size

    total = 0
    correct = 0
    for row in all_predictions:
        try:
            match_id = int(row.get("match_id"))
        except (TypeError, ValueError):
            continue

        actual = match_results.get(match_id)
        pick = str(row.get("pick") or "").upper().strip()
        if actual and pick in {"1", "N", "2"}:
            total += 1
            if pick == actual:
                correct += 1

    if total == 0:
        print(f"[INFO] J{day_no}: aucun vote communauté sur les matchs jugés.")
        return {"correct": 0, "total": 0, "rate": None}

    rate = round(correct * 100 / total, 1)
    print(f"[OK] J{day_no}: communauté {correct}/{total} = {rate}%.")
    return {"correct": correct, "total": total, "rate": rate}


def choose(seed, items):
    import random
    r = random.Random(seed)
    return r.choice(items)


CLUB_DISPLAY = {
    "STADE RENNAIS FC": "Rennes",
    "LE MANS FC": "Le Mans",
    "PARIS SAINT-GERMAIN": "PSG",
    "PARIS SAINT GERMAIN": "PSG",
    "LOSC LILLE": "Lille",
    "LOSC": "Lille",
    "OLYMPIQUE DE MARSEILLE": "Marseille",
    "OLYMPIQUE LYONNAIS": "Lyon",
    "RC LENS": "Lens",
    "RACING CLUB DE LENS": "Lens",
    "RC STRASBOURG ALSACE": "Strasbourg",
    "AJ AUXERRE": "Auxerre",
    "ANGERS SCO": "Angers",
    "STADE BRESTOIS 29": "Brest",
    "TOULOUSE FC": "Toulouse",
    "FC LORIENT": "Lorient",
    "ESTAC TROYES": "Troyes",
    "HAVRE AC": "Le Havre",
    "LE HAVRE AC": "Le Havre",
    "AS MONACO": "Monaco",
    "PARIS FC": "Paris FC",
    "OGC NICE": "Nice",
}


def club_display(name):
    raw = str(name or "").strip()
    return CLUB_DISPLAY.get(raw.upper(), raw.title() if raw.isupper() else raw)


def free_summary(payload):
    """Bilan court, premium et fun : journée, PSG, Footix, buteurs et communauté."""
    day = payload["journee"]
    matches = payload["matches"]
    bilan = payload["bilan_footix"]
    community = payload.get("communaute")

    def parsed(m):
        try:
            h, a = [int(x) for x in m["score_final"].split("-")]
        except Exception:
            h, a = 0, 0
        home, away = m["match"].split(" - ", 1)
        return club_display(home), club_display(away), h, a

    def impact(m):
        _, _, h, a = parsed(m)
        return (h + a, abs(h - a))

    parts = []

    # 1) Fait marquant de la journée : match le plus prolifique.
    standout = max(matches, key=impact) if matches else None
    if standout:
        home, away, h, a = parsed(standout)
        if h == a:
            parts.append(
                f"⚽ Le fait du jour : {home} et {away} se quittent sur un spectaculaire {h}-{a}, "
                f"l'une des affiches les plus animées de cette J{day}."
            )
        else:
            winner = home if h > a else away
            loser = away if h > a else home
            parts.append(
                f"⚽ Le fait du jour : {winner} s'impose {h}-{a} face à {loser} "
                f"au terme de l'un des matchs les plus animés de cette J{day}."
            )

    # 2) Petite signature parisienne, toujours factuelle.
    psg = next(
        (
            m for m in matches
            if "paris saint germain" in norm(m["match"]) or "psg" in norm(m["match"]).split()
        ),
        None,
    )
    if psg:
        home, away, h, a = parsed(psg)
        psg_is_home = "paris saint germain" in norm(home) or norm(home) == "psg"
        psg_goals, opp_goals = (h, a) if psg_is_home else (a, h)
        opponent = away if psg_is_home else home
        if psg_goals > opp_goals:
            parts.append(
                f"🔴🔵 Côté Paris, le PSG s'impose {psg_goals}-{opp_goals} face à {opponent}. "
                "Une ligne du bilan qu'on apprécie forcément un peu plus par ici."
            )
        elif psg_goals < opp_goals:
            parts.append(
                f"🔴🔵 Côté Paris, le PSG s'incline {psg_goals}-{opp_goals} face à {opponent}. "
                "Pas la partie du bilan qu'on avait envie de relire, mais le terrain a parlé."
            )
        else:
            parts.append(
                f"🔴🔵 Côté Paris, le PSG concède le nul {psg_goals}-{opp_goals} face à {opponent}. "
                "Un résultat un peu frustrant côté supporter parisien."
            )

    # 3) Performance éditoriale Footix.
    good = int(bilan.get("bons_pronos", 0) or 0)
    judged = int(bilan.get("pronos_juges", 0) or 0)
    hit_s = int(bilan.get("buteurs_trouves", 0) or 0)
    pred_s = int(bilan.get("buteurs_pronostiques", 0) or 0)
    rate = round(good * 100 / judged, 1) if judged else None

    scorer_hits = []
    for m in matches:
        for name in (m.get("buteurs_trouves") or []):
            if name not in scorer_hits:
                scorer_hits.append(name)

    footix_bits = []
    if judged:
        footix_bits.append(
            f"{good}/{judged} pronostics corrects, soit {str(rate).replace('.', ',')} % de réussite"
        )
    if pred_s:
        scorer_text = f"{hit_s}/{pred_s} buteurs trouvés"
        if scorer_hits:
            scorer_text += ", avec " + ", ".join(scorer_hits)
        footix_bits.append(scorer_text)

    if footix_bits:
        parts.append("🎯 Footix : " + " ; ".join(footix_bits) + ".")

    # 4) Communauté + duel Footix/communauté.
    if isinstance(community, dict) and community.get("rate") is not None:
        c_rate = float(community["rate"])
        c_total = int(community.get("total", 0) or 0)
        c_correct = int(community.get("correct", 0) or 0)

        comparison = ""
        if rate is not None:
            if rate > c_rate + 0.05:
                comparison = " Footix prend l'avantage sur cette journée."
            elif c_rate > rate + 0.05:
                comparison = " La communauté prend l'avantage sur cette journée."
            else:
                comparison = " Égalité parfaite entre Footix et la communauté."

        parts.append(
            f"👥 La communauté termine à {str(round(c_rate, 1)).replace('.', ',')} % de réussite "
            f"({c_correct}/{c_total} pronostics jugés).{comparison}"
        )

    # Conclusion courte, sans surcharger.
    if judged and rate is not None:
        if rate >= 75:
            conclusion = "Une journée solide à conserver comme référence avant la prochaine grille."
        elif rate >= 50:
            conclusion = "Un bilan encourageant, avec encore quelques pièges à mieux lire sur la prochaine grille."
        else:
            conclusion = "Une journée contrastée pour Footix. Il faudra viser plus juste sur la prochaine grille."
        parts.append(conclusion)

    return "\n\n".join(parts[:5])


def main():
    schedule = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    pronos = json.loads(PRONOS.read_text(encoding="utf-8"))
    days = pronos.setdefault("days", {})
    force = os.getenv("FORCE_REVIEW") == "1"
    changed = False

    for sched_day in schedule:
        day_no = str(sched_day.get("journee"))
        matches = sched_day.get("matches") or []
        if not matches:
            continue

        fixtures = []
        all_finished = True
        for match in matches:
            f = match[2] if len(match) > 2 and isinstance(match[2], dict) else {}
            if not f.get("completed") or result_pick(f) is None:
                all_finished = False
                break
            fixtures.append((match[0], match[1], f))
        if not all_finished:
            continue

        day = days.setdefault(day_no, {})
        existing = day.get("review") or {}

        good_pronos = 0
        judged = 0
        scorer_hits = 0
        scorer_predictions = 0
        scorer_data_ready = True
        match_payload = []
        community = community_success(day_no, fixtures)

        for home, away, f in fixtures:
            p = prono_for(day, home, away)
            actual_pick = result_pick(f)
            pick = str(p.get("pick") or "").upper().strip()
            if pick in {"1", "N", "2"}:
                judged += 1
                if pick == actual_pick:
                    good_pronos += 1

            predicted = predicted_scorers(p)
            actual_scorers = f.get("actualScorers")
            scorers_verified = f.get("scorersVerified") is True
            if predicted and (not isinstance(actual_scorers, list) or not scorers_verified):
                # On n'invente jamais un "n'a pas marqué" si la timeline BSD n'est pas complète.
                scorer_data_ready = False
                actual_scorers = actual_scorers if isinstance(actual_scorers, list) else []

            hits = []
            misses = []
            for name in predicted:
                scorer_predictions += 1
                if scorer_hit(name, actual_scorers or []):
                    scorer_hits += 1
                    hits.append(name)
                else:
                    misses.append(name)

            match_payload.append({
                "match": f"{home} - {away}",
                "score_final": f"{f['homeScore']}-{f['awayScore']}",
                "prono_1N2": pick or None,
                "resultat_1N2": actual_pick,
                "prono_correct": bool(pick and pick == actual_pick),
                "score_prevu": p.get("score") or None,
                "buteurs_pronostiques": predicted,
                "buteurs_reels": actual_scorers or [],
                "buteurs_trouves": hits,
                "buteurs_rates": misses,
            })

        # Pour les nouvelles journées, on préfère attendre les données buteurs.
        # Pour une ancienne journée déjà validée manuellement, on conserve le nombre
        # de bons buteurs du bilan existant afin de ne pas rester bloqué indéfiniment.
        legacy_good_scorers = existing.get("goodScorers") if isinstance(existing, dict) else None
        if not scorer_data_ready and legacy_good_scorers is None:
            print(f"[WAIT] J{day_no}: résultats terminés, données buteurs encore incomplètes.")
            continue
        if not scorer_data_ready and legacy_good_scorers is not None:
            try:
                scorer_hits = int(legacy_good_scorers)
            except (TypeError, ValueError):
                scorer_hits = 0

        review = {
            "goodPronos": good_pronos,
            "judgedPronos": judged,
            "goodScorers": scorer_hits,
            "scorerPredictions": scorer_predictions,
            "summary": "",
            "autoGenerated": True,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "model": REVIEW_MODEL,
            "communityCorrect": community.get("correct") if isinstance(community, dict) else None,
            "communityPredictions": community.get("total") if isinstance(community, dict) else None,
            "communityRate": community.get("rate") if isinstance(community, dict) else None,
        }

        payload = {
            "journee": int(day_no),
            "bilan_footix": {
                "bons_pronos": good_pronos,
                "pronos_juges": judged,
                "buteurs_trouves": scorer_hits,
                "buteurs_pronostiques": scorer_predictions,
            },
            "matches": match_payload,
            "communaute": community,
        }

        review["summary"] = free_summary(payload)

        # Un bilan auto existant n'est régénéré que si les données calculées
        # ont réellement changé. Cela permet aux buteurs BSD arrivés plus tard
        # de corriger le bilan sans créer un commit à chaque workflow.
        same_stats = (
            isinstance(existing, dict)
            and existing.get("autoGenerated")
            and existing.get("model") == REVIEW_MODEL
            and int(existing.get("goodPronos", -1) or 0) == good_pronos
            and int(existing.get("judgedPronos", -1) or 0) == judged
            and int(existing.get("goodScorers", -1) or 0) == scorer_hits
            and int(existing.get("scorerPredictions", -1) or 0) == scorer_predictions
            and existing.get("communityCorrect") == (
                community.get("correct") if isinstance(community, dict) else None
            )
            and existing.get("communityPredictions") == (
                community.get("total") if isinstance(community, dict) else None
            )
            and existing.get("communityRate") == (
                community.get("rate") if isinstance(community, dict) else None
            )
        )
        if same_stats and existing.get("summary") and not force:
            continue

        day["review"] = review
        changed = True
        print(f"[OK] J{day_no}: {good_pronos}/{judged} pronos, {scorer_hits}/{scorer_predictions} buteurs.")

    if changed:
        pronos["updated_at"] = datetime.now(timezone.utc).isoformat()
        PRONOS.write_text(json.dumps(pronos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        print("[OK] Aucun nouveau bilan à générer.")

if __name__ == "__main__":
    main()
