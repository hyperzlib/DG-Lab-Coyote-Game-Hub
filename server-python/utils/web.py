from __future__ import annotations
from functools import wraps
import json
from typing import Any, Optional, Dict
from aiohttp import web
import uuid
import netifaces

ParamRule = Dict[str, Any]

class ParamInvalidException(web.HTTPBadRequest):
    def __init__(self, param_list: list[str], rules: dict[str, ParamRule]):
        self.code = "param_invalid"
        self.param_list = param_list
        self.rules = rules
        param_list_str = "'" + ("', '".join(param_list)) + "'"
        super().__init__(reason=f"Param invalid: {param_list_str}")

async def get_param(request: web.Request, rules: Optional[dict[str, ParamRule]] = None):
    params: dict[str, Any] = {}
    for key, value in request.match_info.items():
        params[key] = value
    for key, value in request.query.items():
        params[key] = value
    if request.method == 'POST':
        if request.headers.get('content-type') == 'application/json':
            data = await request.json()
            if data is not None and isinstance(data, dict):
                for key, value in data.items():
                    params[key] = value
        else:
            data = await request.post()
            for key, value in data.items():
                params[key] = value

    if rules is not None:
        invalid_params: list[str] = []
        for key, rule in rules.items():
            if "required" in rule and rule["required"] and key not in params.keys():
                invalid_params.append(key)
                continue
            
            if key in params:
                if "type" in rule:
                    if rule["type"] is dict:
                        if params[key] not in rule["type"]:
                            invalid_params.append(key)
                            continue
                    try:
                        if rule["type"] == int:
                            params[key] = int(params[key])
                        elif rule["type"] == float:
                            params[key] = float(params[key])
                        elif rule["type"] == bool:
                            val = params[key]
                            if isinstance(val, bool):
                                params[key] = val
                            elif isinstance(val, str):
                                val = val.lower()
                                if val.lower() == "false" or val == "0":
                                    params[key] = False
                                else:
                                    params[key] = True
                            elif isinstance(val, int):
                                if val == 0:
                                    params[key] = False
                                else:
                                    params[key] = True
                            else:
                                params[key] = True
                    except ValueError:
                        invalid_params.append(key)
                        continue
            else:
                if "default" in rule:
                    params[key] = rule["default"]
                else:
                    params[key] = None

        if len(invalid_params) > 0:
            raise ParamInvalidException(invalid_params, rules)

    return params

async def api_response(status, data=None, error=None, warning=None, http_status=200, request: Optional[web.Request] = None):
    ret = { "status": status }
    if data:
        ret["data"] = data
    if error:
        ret["error"] = error
    if warning:
        ret["warning"] = warning
    if request and is_websocket(request):
        ret["event"] = "response"
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        await ws.send_json(ret)
        await ws.close()
    else:
        return web.json_response(ret, status=http_status)

def is_websocket(request: web.Request):
    return request.headers.get('Upgrade', '').lower() == 'websocket'

def generate_uuid():
    return str(uuid.uuid4())

def get_outgoing_ip():
    ifaces = netifaces.interfaces()
    addresses = []
    for iface in ifaces:
        if iface.startswith("lo"):
            continue
        addrs = netifaces.ifaddresses(iface)
        if netifaces.AF_INET in addrs:
            for addr in addrs[netifaces.AF_INET]:
                addresses.append(addr["addr"])

    # sort by length
    addresses.sort(key=lambda x: len(x))

    return addresses