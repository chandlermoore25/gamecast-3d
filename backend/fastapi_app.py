# fastapi_app.py
from fastapi import FastAPI, WebSocket
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import AsyncGenerator
import asyncio, json, datetime
from threading import Thread
from queue import Queue, Empty

from mlb_live_stream import list_games, stream_pitches

app = FastAPI(title="Gamecast Stream Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

DEFAULT_SZ = {"TOP": 3.5, "BOT": 1.5}

def zone_bucket(px, pz, sz_top=None, sz_bot=None):
    if px is None or pz is None:
        return {"bucket": None, "inZone": False}
    top = sz_top or DEFAULT_SZ["TOP"]
    bot = sz_bot or DEFAULT_SZ["BOT"]
    if top <= bot: top, bot = DEFAULT_SZ["TOP"], DEFAULT_SZ["BOT"]
    # map to 5×5 cells (1..25)
    hx = int(((px + 1.0) / 2.0) * 5) + 1
    vz = int(((pz - bot) / max(0.01, (top - bot))) * 5) + 1
    if hx < 1 or hx > 5 or vz < 1 or vz > 5:
        return {"bucket": None, "inZone": False}
    bucket = (vz - 1) * 5 + hx
    return {"bucket": bucket, "inZone": True}

@app.get("/api/games")
def api_games(date: str | None = None):
    return JSONResponse(list_games(date=date))

def _bg_stream(gamePk: int, q: Queue):
    try:
        for ev in stream_pitches(gamePk=gamePk, poll_seconds=2.5):
            norm = {
                "event": "pitch",
                "gamePk": ev["gamePk"],
                "ts": ev["ts"],
                "inning": ev["inning"],
                "half": ev["half"],
                "outs": ev["outs"],
                "count": ev.get("count") or {"balls": ev.get("balls"), "strikes": ev.get("strikes")},
                "batter": {"id": ev.get("batterId"), "name": ev.get("batterName")},
                "pitcher": {"id": ev.get("pitcherId"), "name": ev.get("pitcherName")},
                "pitch": {
                    "number": ev.get("pitchNumber"),
                    "type": ev.get("pitchType"),
                    "mph": ev.get("mph"),
                    "outcome": ev.get("outcome"),
                    "loc": {"px": ev.get("locX"), "pz": ev.get("locZ")},
                    "zone": zone_bucket(ev.get("locX"), ev.get("locZ"), ev.get("szTop"), ev.get("szBot")),
                },
                "bases": {"onFirst": ev.get("onFirst"), "onSecond": ev.get("onSecond"), "onThird": ev.get("onThird")},
                "atBatIndex": ev.get("atBatIndex"),
                "idempotencyKey": ev.get("idempotencyKey") or f"{ev['gamePk']}-{ev.get('atBatIndex')}-{ev.get('pitchNumber')}",
            }
            q.put(norm)
    finally:
        q.put(None)

@app.get("/sse/stream")
async def sse_stream(gamePk: int):
    q: Queue = Queue(maxsize=1000)
    Thread(target=_bg_stream, args=(gamePk, q), daemon=True).start()

    async def gen():
        while True:
            try:
                item = q.get(timeout=60)
            except Empty:
                item = {"event": "heartbeat", "ts": datetime.datetime.utcnow().isoformat() + "Z"}
            if item is None:
                yield b"event: end\n\n"
                break
            data = json.dumps(item)
            yield f"event: {item.get('event','pitch')}\n".encode()
            yield f"data: {data}\n\n".encode()
            await asyncio.sleep(0)

    return StreamingResponse(gen(), media_type="text/event-stream")

@app.websocket("/ws/game/{gamePk}")
async def ws_stream(ws: WebSocket, gamePk: int):
    await ws.accept()
    q: Queue = Queue(maxsize=1000)
    Thread(target=_bg_stream, args=(gamePk, q), daemon=True).start()
    try:
        while True:
            try:
                item = q.get(timeout=60)
            except Empty:
                item = {"event": "heartbeat", "ts": datetime.datetime.utcnow().isoformat() + "Z"}
            if item is None:
                await ws.send_text(json.dumps({"event": "end"}))
                break
            await ws.send_text(json.dumps(item))
    finally:
        await ws.close()
