# mlb_live_stream.py — v3
import requests, time, datetime as dt
from typing import Dict, Any, List, Optional

BASE = 'https://statsapi.mlb.com/api/v1'
LIVE = 'https://statsapi.mlb.com/api/v1.1'

def _safe(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and k in d: d = d[k]
        else: return default
    return d

def list_games(date: Optional[str] = None) -> List[Dict[str, Any]]:
    url = f"{BASE}/schedule?sportId=1&date={date}" if date else f"{BASE}/schedule?sportId=1"
    r = requests.get(url, timeout=20); r.raise_for_status()
    data = r.json()
    out = []
    for d in data.get('dates', []):
        for g in d.get('games', []):
            out.append({
                'gamePk': g.get('gamePk'),
                'away': _safe(g,'teams','away','team','abbreviation', default=_safe(g,'teams','away','team','name')),
                'home': _safe(g,'teams','home','team','abbreviation', default=_safe(g,'teams','home','team','name')),
                'status': _safe(g,'status','abstractGameState', default='Unknown')
            })
    return out

def stream_pitches(gamePk: int):
    url = f"{LIVE}/game/{gamePk}/feed/live"
    seen = set()
    while True:
        r = requests.get(url, timeout=20); r.raise_for_status()
        data = r.json()
        for ev in _iter_pitch_events(data, gamePk):
            key = (ev.get('id') or ev.get('ts') or str(ev))
            if key in seen: continue
            seen.add(key)
            yield ev
        time.sleep(2.5)

def replay_pitches(gamePk: int, start_marker: Optional[str] = None):
    url = f"{LIVE}/game/{gamePk}/feed/live"
    r = requests.get(url, timeout=30); r.raise_for_status()
    data = r.json()
    started = (start_marker is None)
    for ev in _iter_pitch_events(data, gamePk):
        if not started and _match_marker(ev, start_marker): started = True
        if not started: continue
        yield ev
    yield {'event':'end','gamePk':gamePk,'ts': dt.datetime.utcnow().isoformat()+'Z'}

def _iter_pitch_events(data, gamePk):
    allPlays = _safe(data,'liveData','plays','allPlays', default=[])
    for ab in allPlays:
        about = ab.get('about', {}); inning = about.get('inning'); half = about.get('halfInning'); outs = about.get('outs')
        events = ab.get('playEvents', [])
        for pe in events:
            if not (_safe(pe,'isPitch') or _safe(pe,'details','isPitch')): continue
            ev = {
                'event':'pitch',
                'gamePk': gamePk,
                'ts': dt.datetime.utcnow().isoformat()+'Z',
                'inning': inning, 'half': half, 'outs': outs,
                'batter': _safe(ab,'matchup','batter','fullName', default='Batter'),
                'pitcher': _safe(ab,'matchup','pitcher','fullName', default='Pitcher'),
                'pitch': {
                    'number': pe.get('pitchNumber'),
                    'type': _safe(pe,'details','type','code', default=_safe(pe,'details','type','description')),
                    'mph': _safe(pe,'pitchData','startSpeed'),
                    'loc': {'px': _safe(pe,'pitchData','coordinates','pX'), 'pz': _safe(pe,'pitchData','coordinates','pZ')},
                    'desc': _safe(pe,'details','description')
                }
            }
            yield ev
            call = (_safe(pe,'details','call','description') or '').lower()
            if 'swinging' in call: yield {'event':'swing','gamePk':gamePk,'ts':ev['ts'],'inning':inning,'half':half}
            if 'in play' in call: yield {'event':'contact','gamePk':gamePk,'ts':ev['ts'],'inning':inning,'half':half,'inPlay':True}
        count = _safe(ab,'result','description')
        yield {'event':'outcome','gamePk':gamePk,'ts': dt.datetime.utcnow().isoformat()+'Z','desc': count or ''}

def _match_marker(ev, marker: str) -> bool:
    parts = dict(p.split('=') for p in marker.split(',') if '=' in p)
    inn = int(parts.get('inning', ev.get('inning', 0)))
    half = parts.get('half', ev.get('half'))
    pn = int(parts.get('pitch', 0))
    num = _safe(ev,'pitch','number') or 0
    return (ev.get('inning') == inn) and (ev.get('half') == half) and (pn == 0 or num == pn)
