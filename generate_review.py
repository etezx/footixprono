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


def choose(seed, items):
    import random
    r = random.Random(seed)
    return r.choice(items)

def free_summary(payload):
    """Résumé 100 % local : raconte réellement la journée à partir des scores fournis."""
    day = payload["journee"]
    matches = payload["matches"]
    bilan = payload["bilan_footix"]

    def parsed(m):
        try:
            h, a = [int(x) for x in m["score_final"].split("-")]
        except Exception:
            h, a = 0, 0
        home, away = m["match"].split(" - ", 1)
        return home, away, h, a

    def impact(m):
        _, _, h, a = parsed(m)
        return (abs(h-a), h+a)

    ranked = sorted(matches, key=impact, reverse=True)
    standout = ranked[0] if ranked else None
    second = ranked[1] if len(ranked) > 1 else None
    draws = [m for m in matches if parsed(m)[2] == parsed(m)[3]]
    surprises = [m for m in matches if m.get("prono_1N2") and not m.get("prono_correct")]
    scorer_hits = [n for m in matches for n in (m.get("buteurs_trouves") or [])]
    seed = f"{day}-" + "-".join(m["score_final"] for m in matches)

    intros = [
        "Journée terminée, et il y avait franchement de quoi raconter 😅.",
        "Coup de sifflet final sur cette journée : quelques cartons, des matchs accrochés et déjà des pronos qui piquent un peu 🫠.",
        "Voilà, tout le monde a joué ! Une journée bien animée, avec son lot de confirmations et de petites claques 👀.",
    ]
    parts = [choose(seed+"intro", intros)]

    football_bits = []
    for idx, m in enumerate([x for x in (standout, second) if x]):
        home, away, h, a = parsed(m)
        if h == a:
            football_bits.append(f"{home} et {away} se sont neutralisés {h}-{a}")
        else:
            winner = home if h > a else away
            score = f"{h}-{a}"
            if abs(h-a) >= 3 or h+a >= 5:
                football_bits.append(f"{winner} a frappé fort contre {away if winner==home else home} ({score}) 🔥")
            else:
                football_bits.append(f"{winner} a fait le boulot face à {away if winner==home else home} ({score})")
    if football_bits:
        parts.append("Sur les terrains, " + ", tandis que ".join(football_bits) + ".")

    if draws:
        examples = ", ".join(f"{m['match']} ({m['score_final']})" for m in draws[:2])
        parts.append(f"On a aussi eu des rencontres beaucoup plus serrées, notamment {examples}. Pas exactement le genre de matchs qui laisse la grille de pronos tranquille 😬.")

    good = int(bilan.get("bons_pronos", 0) or 0)
    judged = int(bilan.get("pronos_juges", 0) or 0)
    if judged:
        rate = round(good * 100 / judged, 1)
        verdict = (
            "Footix avait plutôt le nez fin 🎯" if rate >= 75 else
            "c’est correct, mais il reste de la marge" if rate >= 50 else
            "on va éviter d’encadrer cette grille au mur 🫠"
        )
        parts.append(f"Côté pronostics, bilan de {good}/{judged}, soit {str(rate).replace('.', ',')} % : {verdict}.")

    if surprises:
        m = choose(seed+"miss", surprises)
        parts.append(f"Le prono qui me reste un peu en travers ? {m['match']} : j’avais choisi {m.get('prono_1N2')}, et le terrain en a décidé autrement. Le football adore nous rappeler qui commande.")

    hit_s = int(bilan.get("buteurs_trouves", 0) or 0)
    pred_s = int(bilan.get("buteurs_pronostiques", 0) or 0)
    if pred_s:
        if scorer_hits:
            parts.append(f"Chez les buteurs, {hit_s} sélection(s) trouvée(s), avec notamment {', '.join(scorer_hits[:3])} ✅.")
        else:
            parts.append(f"Chez les buteurs, {hit_s} sélection(s) validée(s). Il y a eu de bonnes intuitions, même si tout n’est pas encore parfait ✅.")

    psg = next((m for m in matches if "PARIS SAINT-GERMAIN" in m["match"] or "PSG" in m["match"]), None)
    if psg:
        home, away, h, a = parsed(psg)
        psg_home = "PARIS SAINT-GERMAIN" in home or home == "PSG"
        pg, og = (h, a) if psg_home else (a, h)
        if pg > og:
            parts.append("Et Paris qui gagne, forcément, ça met toujours un petit supplément de bonne humeur au débrief ❤️💙.")
        elif pg < og:
            parts.append("Pour Paris, on va passer assez vite… mon côté supporter a déjà fait le débrief tout seul dans sa tête 😭.")
        else:
            parts.append("Et Paris laisse deux points en route avec ce nul… mon côté supporter avait évidemment commandé un peu mieux 😬.")

    return "\n\n".join(parts[:6])

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
            "model": "Footix local gratuit",
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
        }

        review["summary"] = free_summary(payload)
        review["model"] = "Footix local gratuit"

        # Un bilan auto existant n'est régénéré que si les données calculées
        # ont réellement changé. Cela permet aux buteurs BSD arrivés plus tard
        # de corriger le bilan sans créer un commit à chaque workflow.
        same_stats = (
            isinstance(existing, dict)
            and existing.get("autoGenerated")
            and int(existing.get("goodPronos", -1) or 0) == good_pronos
            and int(existing.get("judgedPronos", -1) or 0) == judged
            and int(existing.get("goodScorers", -1) or 0) == scorer_hits
            and int(existing.get("scorerPredictions", -1) or 0) == scorer_predictions
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
