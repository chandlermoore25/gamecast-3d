# mlb_live_stream.py
# Ingest MLB StatsAPI → normalize per-pitch events to a stable schema
# Debug logs throughout; resilient to missing fields.

from __future__ import annotations
import requests, time, datetime as dt
from typing import Dict, Generator, Any, List, Optional

BASE = "https://statsapi.mlb.com/api/v1"
LIVE = "https://statsapi.mlb.com/api/v1.1"

def _iso_now() -> str:
    return dt.datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

def list_games(date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return [{gamePk, away, home, status}] for a given date (YYYY-MM-DD)."""
    if not date:
        date = dt.datetime.utcnow().date().isoformat()
    url = f"{BASE}/schedule?sportId=1&date={date}"
    print(f"[API] GET {url}")
    r = requests.get(url, timeout=15); r.raise_for_status()
    data = r.json()
    out = []
    for d in data.get("dates", []):
        for g in d.get("games", []):
            out.append({
                "gamePk": g.get("gamePk"),
                "away":   g.get("teams", {}).get("away", {}).get("team", {}).get("name"),
                "home":   g.get("teams", {}).get("home", {}).get("team", {}).get("name"),
                "status": g.get("status", {}).get("detailedState")
            })
    print(f"[API] games={len(out)} for {date}")
    return out

def _safe(d: dict, *path, default=None):
    cur = d
    for p in path:
        if not isinstance(cur, dict): return default
        cur = cur.get(p)
        if cur is None: return default
    return cur

def _player_name(players: dict, pid: Optional[int]) -> Optional[str]:
    if not pid: return None
    key = f"ID{pid}"
    return _safe(players, key, "fullName")

def stream_pitches(gamePk: int, poll_seconds: float = 2.5) -> Generator[Dict[str, Any], None, None]:
    """Yield normalized 'pitch' events for gamePk with idempotency and retries."""
    backoff = poll_seconds
    seen: set[str] = set()
    print(f"[STREAM] start gamePk={gamePk} poll={poll_seconds}s")

    while True:
        try:
            url = f"{LIVE}/game/{gamePk}/feed/live"
            r = requests.get(url, timeout=20)
            if r.status_code >= 500:
                print(f"[API] {r.status_code} on live feed; backing off {backoff:.1f}s")
                time.sleep(backoff); continue
            r.raise_for_status()
            data = r.json()

            players = _safe(data, "gameData", "players", default={})
            linescore = _safe(data, "liveData", "linescore", default={})
            offense = _safe(linescore, "offense", default={})

            all_plays = _safe(data, "liveData", "plays", "allPlays", default=[]) or []
            for play in all_plays:
                about = play.get("about", {})
                matchup = play.get("matchup", {})
                batter_id = _safe(matchup, "batter", "id")
                pitcher_id = _safe(matchup, "pitcher", "id")

                # iterate playEvents and pick pitches
                events = play.get("playEvents", []) or []
                atBatIndex = play.get("atBatIndex")
                inning = about.get("inning")
                half = about.get("halfInning")
                outs = about.get("outs")

                for idx, pe in enumerate(events, start=1):
                    is_pitch = bool(_safe(pe, "details", "isPitch", default=False)) or ("pitchData" in pe)
                    if not is_pitch: continue

                    pnum = pe.get("pitchNumber") or idx
                    key = f"{gamePk}-{atBatIndex}-{pnum}"
                    if key in seen: continue
                    seen.add(key)

                    call_desc = _safe(pe, "details", "call", "description")
                    outcome = call_desc or _safe(pe, "details", "description")
                    ptype = _safe(pe, "details", "type", "description")

                    mph = _safe(pe, "pitchData", "startSpeed")
                    px = _safe(pe, "pitchData", "coordinates", "pX")
                    pz = _safe(pe, "pitchData", "coordinates", "pZ")
                    sz_top = _safe(pe, "pitchData", "strikeZoneTop")
                    sz_bot = _safe(pe, "pitchData", "strikeZoneBottom")

                    balls = _safe(pe, "count", "balls")
                    strikes = _safe(pe, "count", "strikes")

                    ev = {
                        "event": "pitch",
                        "ts": _iso_now(),
                        "gamePk": gamePk,
                        "inning": inning,
                        "half": half,
                        "outs": outs,
                        "count": {"balls": balls, "strikes": strikes},
                        "batterId": batter_id,
                        "batterName": _player_name(players, batter_id),
                        "pitcherId": pitcher_id,
                        "pitcherName": _player_name(players, pitcher_id),
                        "pitchNumber": pnum,
                        "pitchType": ptype,
                        "mph": mph,
                        "outcome": outcome,
                        "locX": px, "locZ": pz,
                        "szTop": sz_top, "szBot": sz_bot,
                        # live base state from linescore offense block
                        "onFirst": bool(offense.get("first")),
                        "onSecond": bool(offense.get("second")),
                        "onThird": bool(offense.get("third")),
                        "atBatIndex": atBatIndex,
                        "idempotencyKey": key
                    }
                    print(f"[PITCH] {key} {ptype or '—'} {outcome or '—'} mph={mph} loc=({px},{pz}) count={balls}-{strikes}")
                    yield ev

            backoff = poll_seconds
            time.sleep(poll_seconds)

        except requests.RequestException as e:
            print(f"[ERR] network {e}; retry in {backoff:.1f}s")
            time.sleep(backoff)
            backoff = min(backoff * 1.7, 15.0)
        except Exception as e:
            print(f"[ERR] unexpected {e}; keeping stream alive")
            time.sleep(poll_seconds)
