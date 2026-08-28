#!/usr/bin/env python3
"""Génère automatiquement le bilan Footix d'une journée Ligue 1 terminée.

- Calcule les bons pronostics 1/N/2 depuis schedule.json + pronos.json.
- Calcule les buteurs trouvés lorsque ESPN a fourni actualScorers.
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
    p = norm(predicted)
    for scorer in actual:
        a = norm(scorer)
        if a == p or a.endswith(" " + p) or p.endswith(" " + a):
            return True
    return False

def prono_for(day, home, away):
    return day.get(f"{home}|||{away}") or day.get(f"{home} - {away}") or {}


def choose(seed, items):
    import random
    r = random.Random(seed)
    return r.choice(items)

def free_summary(payload):
    """Résumé 100 % local, sans API ni clé externe."""
    day = payload["journee"]
    matches = payload["matches"]
    bilan = payload["bilan_footix"]

    # Match marquant = plus gros total/biggest goal difference.
    def impact(m):
        try:
            h, a = [int(x) for x in m["score_final"].split("-")]
        except Exception:
            return (0, 0)
        return (abs(h-a), h+a)

    standout = max(matches, key=impact) if matches else None
    surprises = [m for m in matches if m.get("prono_1N2") and not m.get("prono_correct")]
    corrects = [m for m in matches if m.get("prono_correct")]
    scorer_hits = []
    for m in matches:
        scorer_hits.extend(m.get("buteurs_trouves") or [])

    seed = f"{day}-" + "-".join(m["score_final"] for m in matches)

    intros = [
        "Rideau sur cette journée, et il y avait encore de quoi avoir quelques sueurs froides 😅.",
        "Fin de journée en Ligue 1 : du spectacle, des confirmations et deux-trois dossiers à ranger discrètement 🫠.",
        "Coup de sifflet final sur la journée : Footix sort la calculette… et garde quand même le sourire ⚽.",
        "La journée est terminée, les comptes sont faits : il y a du bon, du très bon, et quelques pronos qu’on ne montrera pas trop longtemps 👀.",
    ]
    parts = [choose(seed+"intro", intros)]

    if standout:
        home, away = standout["match"].split(" - ", 1)
        hs, as_ = [int(x) for x in standout["score_final"].split("-")]
        winner = home if hs > as_ else away if as_ > hs else None
        if winner:
            parts.append(
                f"Le résultat qui saute aux yeux, c’est {standout['match']} ({standout['score_final']}) : "
                f"{winner} a clairement marqué les esprits 🔥."
            )
        else:
            parts.append(
                f"Parmi les matchs qui retiennent l’attention, {standout['match']} s’est terminé sur un {standout['score_final']} bien accroché 🤝."
            )

    good = bilan.get("bons_pronos", 0)
    judged = bilan.get("pronos_juges", 0)
    if judged:
        rate = round(good * 100 / judged)
        if rate >= 75:
            verdict = "Footix avait plutôt le nez fin 🎯"
        elif rate >= 50:
            verdict = "bilan correct, même si tout n’était pas parfaitement senti"
        else:
            verdict = "bon… on va dire que le ballon n’a pas toujours voulu écouter Footix 🫠"
        parts.append(f"Côté pronos, ça donne {good}/{judged} bons résultats ({rate} %) : {verdict}.")

    if surprises:
        m = choose(seed+"miss", surprises)
        parts.append(
            f"Le petit caillou dans la chaussure ? {m['match']} : j’étais parti sur {m.get('prono_1N2')}, "
            f"et le terrain m’a gentiment rappelé qui commande."
        )
    elif corrects:
        parts.append("Et pour une fois, pas besoin de sortir les grandes excuses : la lecture des matchs était solide 😎.")

    pred_s = bilan.get("buteurs_pronostiques", 0)
    hit_s = bilan.get("buteurs_trouves", 0)
    if pred_s:
        if scorer_hits:
            shown = ", ".join(scorer_hits[:3])
            parts.append(f"Chez les buteurs, {hit_s}/{pred_s} trouvés, avec notamment {shown}. Ça, on prend ✅.")
        else:
            parts.append(f"Pour les buteurs, {hit_s}/{pred_s}. Là, clairement, Footix doit revoir ses fiches avant la prochaine journée 📝.")

    # Petite touche parisienne uniquement si PSG apparaît, sans inventer d'événement.
    psg = next((m for m in matches if "PSG" in m["match"] or "Paris Saint-Germain" in m["match"]), None)
    if psg:
        ph, pa = [int(x) for x in psg["score_final"].split("-")]
        is_home = psg["match"].startswith("PSG") or psg["match"].startswith("Paris Saint-Germain")
        psg_goals, opp_goals = (ph, pa) if is_home else (pa, ph)
        if psg_goals > opp_goals:
            parts.append("Et côté parisien, forcément, la victoire se savoure toujours avec un petit supplément de plaisir ❤️💙.")
        elif psg_goals < opp_goals:
            parts.append("Pour Paris, je vais éviter d’en faire trois paragraphes… mon cœur de supporter a déjà assez pris comme ça 😭.")
        else:
            parts.append("Paris laisse quelques regrets sur ce nul… le supporter en moi aurait évidemment signé pour un peu mieux 😬.")

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
        if existing.get("autoGenerated") and existing.get("summary") and not force:
            continue

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
            if predicted and not isinstance(actual_scorers, list):
                scorer_data_ready = False
                actual_scorers = []
            elif predicted and not actual_scorers:
                # 0-0 legitimately has no scorer; otherwise wait for ESPN scorer data.
                try:
                    total_goals = int(f.get("homeScore", 0)) + int(f.get("awayScore", 0))
                except (TypeError, ValueError):
                    total_goals = 1
                if total_goals > 0:
                    scorer_data_ready = False

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

        # We wait for scorer data so the generated prose cannot call a scorer wrong
        # just because ESPN has not populated the summary yet.
        if not scorer_data_ready:
            print(f"[WAIT] J{day_no}: résultats terminés, données buteurs encore incomplètes.")
            continue

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
