# fastapi_app.py - FIXED VERSION
# Enhanced CORS and WebSocket configuration

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import AsyncGenerator
import asyncio, json, datetime, logging
from threading import Thread
from queue import Queue, Empty

from mlb_live_stream import list_games, stream_pitches

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gamecast Stream Service")

# Enhanced CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:*",
        "http://127.0.0.1:*", 
        "http://0.0.0.0:*",
        "https://gamecast-3d.onrender.com",
        "*"  # Allow all for development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
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

@app.get("/")
async def root():
    return {"status": "GameCast API Running", "endpoints": ["/api/games", "/sse/stream", "/ws/game/{gamePk}"]}

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.datetime.utcnow().isoformat()}

@app.get("/api/games")
def api_games(date: str | None = None):
    try:
        games = list_games(date=date)
        logger.info(f"Retrieved {len(games)} games for date {date}")
        return JSONResponse(games)
    except Exception as e:
        logger.error(f"Error retrieving games: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

def _bg_stream(gamePk: int, q: Queue):
    try:
        logger.info(f"Starting background stream for game {gamePk}")
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
            logger.debug(f"Added pitch event to queue: {norm['idempotencyKey']}")
    except Exception as e:
        logger.error(f"Background stream error for game {gamePk}: {e}")
    finally:
        q.put(None)
        logger.info(f"Background stream ended for game {gamePk}")

@app.get("/sse/stream")
async def sse_stream(gamePk: int):
    logger.info(f"SSE stream requested for game {gamePk}")
    q: Queue = Queue(maxsize=1000)
    Thread(target=_bg_stream, args=(gamePk, q), daemon=True).start()

    async def gen():
        try:
            while True:
                try:
                    item = q.get(timeout=60)
                except Empty:
                    # Send heartbeat
                    item = {"event": "heartbeat", "ts": datetime.datetime.utcnow().isoformat() + "Z"}
                    logger.debug("Sent SSE heartbeat")
                
                if item is None:
                    yield b"event: end\n\n"
                    logger.info("SSE stream ended")
                    break
                
                data = json.dumps(item)
                yield f"event: {item.get('event','pitch')}\n".encode()
                yield f"data: {data}\n\n".encode()
                await asyncio.sleep(0)
        except Exception as e:
            logger.error(f"SSE generator error: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n".encode()

    return StreamingResponse(
        gen(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

# Enhanced WebSocket endpoint with better error handling
@app.websocket("/ws/game/{gamePk}")
async def ws_stream(websocket: WebSocket, gamePk: int):
    try:
        await websocket.accept()
        logger.info(f"WebSocket connected for game {gamePk}")
        
        q: Queue = Queue(maxsize=1000)
        Thread(target=_bg_stream, args=(gamePk, q), daemon=True).start()
        
        while True:
            try:
                item = q.get(timeout=30)  # Reduced timeout for faster heartbeats
            except Empty:
                # Send heartbeat
                item = {"event": "heartbeat", "ts": datetime.datetime.utcnow().isoformat() + "Z"}
                logger.debug("Sent WebSocket heartbeat")
            
            if item is None:
                await websocket.send_text(json.dumps({"event": "end"}))
                logger.info("WebSocket stream ended")
                break
            
            await websocket.send_text(json.dumps(item))
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for game {gamePk}")
    except Exception as e:
        logger.error(f"WebSocket error for game {gamePk}: {e}")
        try:
            await websocket.send_text(json.dumps({"event": "error", "message": str(e)}))
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"WebSocket cleanup completed for game {gamePk}")

# Add test endpoints for debugging
@app.get("/test/pitch")
async def test_pitch():
    """Generate a test pitch event"""
    test_event = {
        "event": "pitch",
        "gamePk": 999999,
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "inning": 1,
        "half": "top",
        "outs": 0,
        "count": {"balls": 1, "strikes": 2},
        "batter": {"id": 12345, "name": "Test Batter"},
        "pitcher": {"id": 67890, "name": "Test Pitcher"},
        "pitch": {
            "number": 3,
            "type": "Fastball",
            "mph": 94.5,
            "outcome": "Strike",
            "loc": {"px": 0.1, "pz": 2.5},
            "zone": {"bucket": 5, "inZone": True}
        },
        "bases": {"onFirst": False, "onSecond": False, "onThird": False},
        "atBatIndex": 1,
        "idempotencyKey": "test-pitch-1"
    }
    return JSONResponse(test_event)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "fastapi_app:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        log_level="info"
    )