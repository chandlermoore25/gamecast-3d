
# fastapi_app.py — integrated reducer + team names + PNA
import os, time, json, logging, datetime
import sqlite3
from threading import Thread
from queue import Queue, Empty
from typing import Dict, Any, Optional

import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response

from mlb_live_stream import list_games, stream_pitches

logger = logging.getLogger("gamecast")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="GameCast Backend", version="1.1.0")

# --- CORS (dev-wide) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PNA preflight support (Chrome 130+) ---
@app.middleware("http")
async def allow_private_network(request: Request, call_next):
    # Preflight gets a synthetic response; normal requests pass through.
    if request.method == "OPTIONS":
        resp = Response(status_code=204)
    else:
        resp = await call_next(request)

    # Advertise PNA support on all responses
    resp.headers["Access-Control-Allow-Private-Network"] = "true"

    # Help CORS for preflights
    if request.method == "OPTIONS":
        origin = request.headers.get("origin", "*")
        req_method = request.headers.get("access-control-request-method", "GET, POST, OPTIONS")
        req_headers = request.headers.get("access-control-request-headers", "*")
        resp.headers.update({
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
            "Access-Control-Allow-Methods": req_method,
            "Access-Control-Allow-Headers": req_headers,
            "Access-Control-Max-Age": "600",
        })
    return resp

# --- Local Replay DB integration ---
DB_PATH = os.getenv("REPLAY_DB", "gamecast-replay.db")

def _db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def db_list_games(date: Optional[str]):
    if not date:
        date = datetime.datetime.utcnow().date().isoformat()
    with _db() as c:
        rows = c.execute(
            "SELECT gamePk, away, home, status FROM games WHERE gameDate = ? ORDER BY home, away",
            (date,),
        ).fetchall()
    return [dict(r) for r in rows]

def db_get_teams(gamePk: int) -> Dict[str, str]:
    with _db() as c:
        r = c.execute("SELECT away, home FROM games WHERE gamePk = ?", (gamePk,)).fetchone()
        if r:
            return {"away": r["away"], "home": r["home"]}
    return {"away": "Away", "home": "Home"}

def db_stream_pitches(gamePk: int, speed: float = 1.0):
    with _db() as c:
        cur = c.execute(
            "SELECT gamePk, atBatIndex, pitchNumber, inning, half, outs, balls, strikes, pitchType, mph, locX, locZ, outcome, ts FROM pitches WHERE gamePk = ? ORDER BY atBatIndex, pitchNumber",
            (gamePk,),
        )
        for r in cur:
            yield {
                "event": "pitch",
                "gamePk": r["gamePk"],
                "ts": r["ts"] or datetime.datetime.utcnow().isoformat() + "Z",
                "inning": r["inning"],
                "half": r["half"],
                "outs": r["outs"],
                "count": {"balls": r["balls"], "strikes": r["strikes"]},
                "batter": {"id": None, "name": None},
                "pitcher": {"id": None, "name": None},
                "pitch": {
                    "number": r["pitchNumber"],
                    "type": r["pitchType"],
                    "mph": r["mph"],
                    "outcome": r["outcome"],
                    "loc": {"px": r["locX"], "pz": r["locZ"]},
                    "zone": None,
                },
                "bases": {"onFirst": False, "onSecond": False, "onThird": False},
                "atBatIndex": r["atBatIndex"],
                "idempotencyKey": f"db-{r['gamePk']}-{r['atBatIndex']}-{r['pitchNumber']}",
            }
            time.sleep(max(0.05, 0.6 / max(0.1, speed)))  # sim pacing

# --- Live helpers ---
def live_get_teams(gamePk: int) -> Dict[str, str]:
    """Fetch team names from StatsAPI for a given gamePk."""
    try:
        url = f"https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        home = data.get("gameData", {}).get("teams", {}).get("home", {}).get("name") or "Home"
        away = data.get("gameData", {}).get("teams", {}).get("away", {}).get("name") or "Away"
        return {"away": away, "home": home}
    except Exception as e:
        logger.warning(f"[LIVE] get teams failed for {gamePk}: {e}")
        return {"away": "Away", "home": "Home"}

# --- Server-side reducer ---
class GameReducer:
    def __init__(self, teams: Dict[str, str]):
        self.state = {
            "inning": 1,
            "half": "top",
            "outs": 0,
            "count": {"balls": 0, "strikes": 0},
            "bases": {"onFirst": False, "onSecond": False, "onThird": False},
            "score": {"away": 0, "home": 0},
            "teams": teams or {"away":"Away","home":"Home"},
        }

    def inning_change(self):
        self.state["outs"] = 0
        self.state["count"] = {"balls": 0, "strikes": 0}
        self.state["bases"] = {"onFirst": False, "onSecond": False, "onThird": False}
        if self.state["half"] == "top":
            self.state["half"] = "bottom"
        else:
            self.state["half"] = "top"
            self.state["inning"] += 1

    def apply(self, ev: Dict[str, Any]) -> Dict[str, Any]:
        # Sync baseline from event if present (don’t fight the upstream feed)
        if "inning" in ev: self.state["inning"] = ev["inning"]
        if "half" in ev: self.state["half"] = ev["half"]
        if "outs" in ev: self.state["outs"] = ev["outs"]
        if "count" in ev and isinstance(ev["count"], dict):
            self.state["count"]["balls"] = ev["count"].get("balls", self.state["count"]["balls"])
            self.state["count"]["strikes"] = ev["count"].get("strikes", self.state["count"]["strikes"])
        if "bases" in ev and isinstance(ev["bases"], dict):
            self.state["bases"].update(ev["bases"])

        # Naive outcome-based updates (works best with Live feed)
        outcome = (ev.get("pitch", {}) or {}).get("outcome", "") or (ev.get("result") or "")
        ol = str(outcome).lower()

        # Strikeout detection
        if "strikeout" in ol or ("called strike" in ol and self.state["count"]["strikes"] >= 2):
            self.state["outs"] = min(3, self.state["outs"] + 1)
            self.state["count"] = {"balls": 0, "strikes": 0}
        # Walk detection
        if "walk" in ol:
            self.state["count"] = {"balls": 0, "strikes": 0}
            # very simple force advance: 1->2->3->run
            if self.state["bases"]["onFirst"] and self.state["bases"]["onSecond"] and self.state["bases"]["onThird"]:
                batting = "away" if self.state["half"] == "top" else "home"
                self.state["score"][batting] += 1
            # shift occupancy
            self.state["bases"]["onThird"] = self.state["bases"]["onThird"] or (self.state["bases"]["onSecond"] and self.state["bases"]["onFirst"])
            self.state["bases"]["onSecond"] = self.state["bases"]["onSecond"] or self.state["bases"]["onFirst"]
            self.state["bases"]["onFirst"] = True

        # In-play outs (very naive)
        if "in play, out" in ol:
            self.state["outs"] = min(3, self.state["outs"] + 1)
            self.state["count"] = {"balls": 0, "strikes": 0}

        # In-play run(s) naive detection
        if "in play, run" in ol or "home run" in ol:
            batting = "away" if self.state["half"] == "top" else "home"
            self.state["score"][batting] += 1

        # Handle inning end
        if self.state["outs"] >= 3:
            self.inning_change()

        # Attach state snapshot to outgoing event
        ev["teams"] = self.state["teams"]
        ev["score"] = self.state["score"]
        ev["game"] = {
            "inning": self.state["inning"],
            "half": self.state["half"],
            "outs": self.state["outs"],
            "count": self.state["count"],
            "bases": self.state["bases"],
        }
        return ev

# --- Routes ---
@app.get("/health")
def health():
    return {"status":"healthy","time":datetime.datetime.utcnow().isoformat()+"Z"}

@app.get("/api/games")
def api_games(date: Optional[str] = None, source: str = Query("live", regex="^(live|db)$")):
    try:
        if source == "db":
            games = db_list_games(date)
            logger.info(f"[DB] Retrieved {len(games)} games for date {date}")
            return JSONResponse(games)
        games = list_games(date=date)
        logger.info(f"[LIVE] Retrieved {len(games)} games for date {date}")
        return JSONResponse(games)
    except Exception as e:
        logger.error(f"Error retrieving games: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

def _bg_stream(gamePk: int, q: Queue, source: str = "live", speed: float = 1.0):
    """Background producer: emits normalized events into a queue with reducer applied."""
    try:
        teams = db_get_teams(gamePk) if source == "db" else live_get_teams(gamePk)
        reducer = GameReducer(teams)
        logger.info(f"Starting background stream for game {gamePk} source={source} teams={teams}")

        events_iter = db_stream_pitches(gamePk, speed) if source == "db" else stream_pitches(gamePk=gamePk, poll_seconds=2.5)

        for ev in events_iter:
            # Ensure schema minimums
            ev.setdefault("event", "pitch")
            ev.setdefault("ts", datetime.datetime.utcnow().isoformat() + "Z")
            ev = reducer.apply(ev)
            q.put(ev)
    except Exception as e:
        logger.error(f"Background stream error for game {gamePk}: {e}")
    finally:
        q.put(None)
        logger.info(f"Background stream ended for game {gamePk}")

@app.get("/sse/stream")
async def sse_stream(gamePk: int, source: str = Query("live", regex="^(live|db)$"), speed: float = 1.0):
    """Server-Sent Events stream of normalized plays."""
    logger.info(f"SSE stream requested for game {gamePk} source={source} speed={speed}")
    q: Queue = Queue(maxsize=1000)
    Thread(target=_bg_stream, args=(gamePk, q, source, speed), daemon=True).start()

    async def gen():
        while True:
            try:
                item = q.get(timeout=60)
            except Empty:
                yield ":

"  # comment to keep-alive
                continue
            if item is None:
                break
            yield f"data: {json.dumps(item)}\n\n"
            import asyncio as aio
            await aio.sleep(0)
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Private-Network": "true",
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)

@app.websocket("/ws/game/{gamePk}")
async def ws_stream(websocket: WebSocket, gamePk: int):
    await websocket.accept()
    qs = websocket.query_params
    source = qs.get("source", "live")
    speed = float(qs.get("speed", "1"))
    logger.info(f"WebSocket connected for game {gamePk} source={source} speed={speed}")

    q: Queue = Queue(maxsize=1000)
    Thread(target=_bg_stream, args=(gamePk, q, source, speed), daemon=True).start()
    try:
        while True:
            try:
                item = q.get(timeout=60)
            except Empty:
                await websocket.send_text(json.dumps({"type":"keepalive","ts":datetime.datetime.utcnow().isoformat()+"Z"}))
                continue
            if item is None:
                break
            await websocket.send_text(json.dumps(item))
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for game {gamePk}")
    except Exception as e:
        logger.error(f"WebSocket error {gamePk}: {e}")
    finally:
        logger.info(f"WebSocket closed for game {gamePk}")

# Simple test event
@app.get("/test/pitch")
def test_pitch():
    test_event = {
        "event": "pitch",
        "gamePk": 123456,
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "inning": 1,
        "half": "top",
        "outs": 0,
        "count": {"balls": 0, "strikes": 1},
        "pitch": {"number": 1, "type": "Fastball", "mph": 97.2, "outcome": "Called Strike", "loc": {"px": 0.1, "pz": 2.8}},
        "bases": {"onFirst": False, "onSecond": False, "onThird": False},
        "atBatIndex": 1,
        "idempotencyKey": "test-pitch-1"
    }
    return JSONResponse(test_event)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_app:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
