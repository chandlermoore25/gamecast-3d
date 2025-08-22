# fastapi_app.py — v3
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import AsyncGenerator
import asyncio, json
from mlb_live_stream import list_games, stream_pitches, replay_pitches

app = FastAPI(title='GameCast API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*']
)

@app.get('/')
def root():
    return {'status':'ok','endpoints':['/api/games','/sse/stream','/ws/game/{gamePk}']}

@app.get('/api/games')
def api_games(date: str | None = None):
    try:
        return JSONResponse(list_games(date=date))
    except Exception as e:
        return JSONResponse({'error': str(e)}, status_code=500)

@app.websocket('/ws/game/{gamePk}')
async def ws_stream(websocket: WebSocket, gamePk: int):
    await websocket.accept()
    try:
        async for ev in _aiter(stream_pitches(gamePk)):
            await websocket.send_text(json.dumps(ev))
    except WebSocketDisconnect:
        pass

@app.get('/sse/stream')
def sse_stream(gamePk: int, mode: str='rewind', from_: str | None=None):
    async def gen() -> AsyncGenerator[bytes, None]:
        yield b':ok\n\n'
        src = replay_pitches(gamePk, start_marker=from_) if mode=='rewind' else stream_pitches(gamePk)
        async for ev in _aiter(src):
            yield ('data: ' + json.dumps(ev) + '\n\n').encode('utf-8')
            await asyncio.sleep(0)
    return StreamingResponse(gen(), media_type='text/event-stream')

async def _aiter(sync_gen):
    for item in sync_gen:
        yield item
        await asyncio.sleep(0)
