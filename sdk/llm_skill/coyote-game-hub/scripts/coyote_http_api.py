#!/usr/bin/env python3
"""
Coyote Game Hub HTTP skill client.

This script uses only HTTP API endpoints from Coyote Game Hub.
It does not use MCP session APIs.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class HttpApiError(RuntimeError):
    """Represents transport-level HTTP failures."""


@dataclass
class CoyoteHttpClient:
    base_url: str
    timeout: float = 10.0

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    def _request(
        self,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            query_dict = {k: str(v) for k, v in query.items() if v is not None}
            if query_dict:
                url = f"{url}?{urlencode(query_dict)}"

        payload = None
        headers = {"Accept": "application/json"}
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(url=url, data=payload, headers=headers, method=method.upper())

        try:
            with urlopen(request, timeout=self.timeout) as response:
                text = response.read().decode("utf-8", errors="replace")
                if not text.strip():
                    return {"status": 1, "code": "OK", "message": "Empty response body"}
                return json.loads(text)
        except HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(body_text)
            except json.JSONDecodeError:
                parsed = {"raw": body_text}
            raise HttpApiError(f"HTTP {exc.code} for {method.upper()} {url}: {parsed}") from exc
        except URLError as exc:
            raise HttpApiError(f"Failed to connect to {url}: {exc}") from exc

    @staticmethod
    def _route_game_id(game_id: str, channel: str) -> str:
        if channel == "main":
            route_id = game_id
        elif channel == "channelB":
            route_id = f"{game_id}.channelB"
        else:
            raise ValueError("channel must be 'main' or 'channelB'")

        return quote(route_id, safe="._-")

    def create_client_id(self) -> Dict[str, Any]:
        return self._request("GET", "/api/client/connect")

    def connect_game(self, game_id: str) -> Dict[str, Any]:
        merged = self.get_game_info_merged(game_id)
        ok = merged.get("status") == 1
        return {
            "status": 1 if ok else 0,
            "code": "OK" if ok else "ERR::GAME_NOT_FOUND",
            "gameId": game_id,
            "message": "HTTP API connected to game" if ok else "Game not reachable via HTTP API",
            "gameInfo": merged,
        }
    
    
    

    """
    /**
     * 获取强度状态的自然语言描述
     */
    private static getStrengthStatusMessage(game: CoyoteGameController, operation: string, channel: 'main' | 'channelB' = 'main', oldStrength?: number, newStrength?: number): string {
        const channelConfig = game.strengthConfig[channel];
        const channelClient = game.clientStrength[channel];
        const current = newStrength ?? channelConfig?.strength ?? 0;
        const limit = channelClient?.limit ?? 20;
        const random = channelConfig?.randomStrength ?? 0;
        const started = game.running ? "已启动" : "未启动";
        const channelName = channel === 'main' ? 'A通道' : 'B通道';

        let message = `${operation}成功。`;
        if (oldStrength !== undefined && newStrength !== undefined) {
            message += `强度从 ${oldStrength} 调整到 ${newStrength}。`;
        }
        message += `通道：${channelName}，当前强度: ${current}/上限: ${limit}，随机强度范围: ±${random}，电击状态: ${started}。`;

        let strengthPercentage = limit !== 0 ? (current / limit) * 100 : 0;

        if (strengthPercentage === 0) {
            message += " 当前没有电击输出。";
        } else if (strengthPercentage < 25) {
            message += " 当前电击强度较低。";
        } else if (strengthPercentage < 50) {
            message += " 当前电击强度中等。";
        } else if (strengthPercentage < 75) {
            message += " 当前电击强度较高。";
        } else {
            message += " 当前电击强度很高！";
        }

        return message;
    }
    """
    
    def get_strength_status_message(self, game_info: Dict[str, Any], channel: str = "main") -> str:
        client_strength = game_info.get("clientStrength", {})
        current = client_strength.get("current", 0)
        limit = client_strength.get("limit", 20)
        strength_config = game_info.get("strengthConfig", {})
        random = strength_config.get("randomStrength", 0)
        started = game_info.get("isRunning", False)
        channel_name = { "main": "A通道", "channelB": "B通道" }.get(channel, channel)
        message = f"通道：{channel_name}，当前强度: {current}/上限: {limit}，随机强度范围: ±{random}，电击状态: {'已启动' if started else '未启动'}。"

        strength_percentage = (current / limit) * 100 if limit != 0 else 0

        if strength_percentage == 0:
            message += " 当前没有电击输出。"
        elif strength_percentage < 25:
            message += " 当前电击强度较低。"
        elif strength_percentage < 50:
            message += " 当前电击强度中等。"
        elif strength_percentage < 75:
            message += " 当前电击强度较高。"
        else:
            message += " 当前电击强度很高！"

        return message

    def get_game_info(self, game_id: str, channel: str = "main") -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, channel)
        return self._request("GET", f"/api/v2/game/{route_id}")

    def get_game_info_merged(self, game_id: str) -> Dict[str, Any]:
        main_info = self.get_game_info(game_id, channel="main")
        channel_b_info = self.get_game_info(game_id, channel="channelB")

        ok = main_info.get("status") == 1 and channel_b_info.get("status") == 1
        message_parts = []
        if main_info.get("status") != 1:
            message_parts.append(f"main failed: {main_info.get('code')}")
        if channel_b_info.get("status") != 1:
            message_parts.append(f"channelB failed: {channel_b_info.get('code')}")

        return {
            "status": 1 if ok else 0,
            "code": "OK" if ok else "ERR::PARTIAL_FAILED",
            "gameId": game_id,
            "message": "merged from two HTTP requests" if ok else "; ".join(message_parts),
            "channels": {
                "main": self.get_strength_status_message(main_info, channel="main"),
                "channelB": self.get_strength_status_message(channel_b_info, channel="channelB"),
            },
            "raw": {
                "main": main_info,
                "channelB": channel_b_info,
            },
        }

    def set_strength(self, game_id: str, channel: str, strength: int) -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, channel)
        body = {"strength": {"set": int(strength)}}
        ret = self._request("POST", f"/api/v2/game/{route_id}/strength", body=body)

        if ret.get("status", 0) == 0:
            return {
                "status": 0,
                "code": ret.get("code", "ERR::UNKNOWN"),
                "gameId": game_id,
                "channel": channel,
                "message": f"无法设置强度: {ret.get('message', '没有错误详情')}",
                "raw_response": ret,
            }
        
        game_info = self.get_game_info(game_id, channel)
        status_message = self.get_strength_status_message(game_info, channel)

        return {
            "status": 1,
            "code": "OK",
            "gameId": game_id,
            "channel": channel,
            "message": f"强度设置成功。{status_message}",
            "raw_response": ret,
        }

    def increase_strength(self, game_id: str, channel: str, amount: int) -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, channel)
        body = {"strength": {"add": int(amount)}}
        ret = self._request("POST", f"/api/v2/game/{route_id}/strength", body=body)

        if ret.get("status", 0) == 0:
            return {
                "status": 0,
                "code": ret.get("code", "ERR::UNKNOWN"),
                "gameId": game_id,
                "channel": channel,
                "message": f"无法增加强度: {ret.get('message', '没有错误详情')}",
                "raw_response": ret,
            }
        
        game_info = self.get_game_info(game_id, channel)
        status_message = self.get_strength_status_message(game_info, channel)

        return {
            "status": 1,
            "code": "OK",
            "gameId": game_id,
            "channel": channel,
            "message": f"强度增加成功。{status_message}",
            "raw_response": ret,
        }

    def decrease_strength(self, game_id: str, channel: str, amount: int) -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, channel)
        body = {"strength": {"sub": int(amount)}}
        ret = self._request("POST", f"/api/v2/game/{route_id}/strength", body=body)

        if ret.get("status", 0) == 0:
            return {
                "status": 0,
                "code": ret.get("code", "ERR::UNKNOWN"),
                "gameId": game_id,
                "channel": channel,
                "message": f"无法减少强度: {ret.get('message', '没有错误详情')}",
                "raw_response": ret,
            }
        
        game_info = self.get_game_info(game_id, channel)
        status_message = self.get_strength_status_message(game_info, channel)

        return {
            "status": 1,
            "code": "OK",
            "gameId": game_id,
            "channel": channel,
            "message": f"强度减少成功。{status_message}",
            "raw_response": ret,
        }

    def get_pulse(self, game_id: str, channel: str) -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, channel)
        return self._request("GET", f"/api/v2/game/{route_id}/pulse")

    def set_pulse(self, game_id: str, channel: str, pulse_id: str) -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, channel)
        return self._request(
            "POST",
            f"/api/v2/game/{route_id}/pulse",
            body={"pulseId": pulse_id},
        )

    def get_pulse_list(self, game_id: str, full: bool = False) -> Dict[str, Any]:
        route_id = self._route_game_id(game_id, "main")
        query = {"type": "full"} if full else None
        return self._request("GET", f"/api/v2/game/{route_id}/pulse_list", query=query)

    def fire_action(
        self,
        game_id: str,
        channel: str,
        strength: int,
        time_ms: int = 5000,
        override: bool = False,
        pulse_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "strength": int(strength),
            "time": int(time_ms),
            "override": bool(override),
        }
        if pulse_id is not None:
            body["pulseId"] = pulse_id

        if channel == "all":
            main_id = self._route_game_id(game_id, "main")
            b_id = self._route_game_id(game_id, "channelB")
            main_result = self._request("POST", f"/api/v2/game/{main_id}/action/fire", body=body)
            b_result = self._request("POST", f"/api/v2/game/{b_id}/action/fire", body=body)
            ok = main_result.get("status") == 1 and b_result.get("status") == 1
            return {
                "status": 1 if ok else 0,
                "code": "OK" if ok else "ERR::PARTIAL_FAILED",
                "gameId": game_id,
                "channel": "all",
                "results": {
                    "main": main_result,
                    "channelB": b_result,
                },
            }

        route_id = self._route_game_id(game_id, channel)
        ret = self._request("POST", f"/api/v2/game/{route_id}/action/fire", body=body)

        if ret.get("status", 0) == 0:
            return {
                "status": 0,
                "code": ret.get("code", "ERR::UNKNOWN"),
                "gameId": game_id,
                "channel": channel,
                "message": f"无法触发动作: {ret.get('message', '没有错误详情')}",
                "raw_response": ret,
            }

        return {
            "status": 1,
            "code": "OK",
            "gameId": game_id,
            "channel": channel,
            "message": "动作触发成功。",
            "raw_response": ret,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coyote Game Hub HTTP API skill client")
    parser.add_argument("--base-url", default="http://127.0.0.1:8920", help="Server base URL")
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout in seconds")
    parser.add_argument("--compact", action="store_true", help="Print compact JSON")

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("create-client-id", help="Get a new client ID from /api/client/connect")

    connect = subparsers.add_parser("connect-game", help="Validate a game via HTTP API")
    connect.add_argument("game_id", help="Game ID")

    get_info = subparsers.add_parser(
        "get-game-info",
        help="Get merged game info by requesting main and channelB separately",
    )
    get_info.add_argument("game_id", help="Game ID")

    set_strength = subparsers.add_parser("set-strength", help="Set channel strength")
    set_strength.add_argument("game_id", help="Game ID")
    set_strength.add_argument("--channel", choices=["main", "channelB"], required=True)
    set_strength.add_argument("--strength", type=int, required=True)

    increase = subparsers.add_parser("increase-strength", help="Increase channel strength")
    increase.add_argument("game_id", help="Game ID")
    increase.add_argument("--channel", choices=["main", "channelB"], required=True)
    increase.add_argument("--amount", type=int, required=True)

    decrease = subparsers.add_parser("decrease-strength", help="Decrease channel strength")
    decrease.add_argument("game_id", help="Game ID")
    decrease.add_argument("--channel", choices=["main", "channelB"], required=True)
    decrease.add_argument("--amount", type=int, required=True)

    get_pulse = subparsers.add_parser("get-pulse", help="Get current pulse info for a channel")
    get_pulse.add_argument("game_id", help="Game ID")
    get_pulse.add_argument("--channel", choices=["main", "channelB"], required=True)

    set_pulse = subparsers.add_parser("set-pulse", help="Set pulse for a channel")
    set_pulse.add_argument("game_id", help="Game ID")
    set_pulse.add_argument("--channel", choices=["main", "channelB"], required=True)
    set_pulse.add_argument("--pulse-id", required=True, help="Pulse ID")

    pulse_list = subparsers.add_parser("get-pulse-list", help="Get pulse list")
    pulse_list.add_argument("game_id", help="Game ID")
    pulse_list.add_argument("--full", action="store_true", help="Request full pulse data")

    fire = subparsers.add_parser("fire-action", help="Trigger fire action")
    fire.add_argument("game_id", help="Game ID")
    fire.add_argument("--channel", choices=["main", "channelB", "all"], required=True)
    fire.add_argument("--strength", type=int, required=True)
    fire.add_argument("--time", type=int, default=5000, help="Duration in milliseconds")
    fire.add_argument("--override", action="store_true", help="Use replace mode")
    fire.add_argument("--pulse-id", default=None, help="Optional pulse ID")

    return parser.parse_args()


def run_command(client: CoyoteHttpClient, args: argparse.Namespace) -> Dict[str, Any]:
    if args.command == "create-client-id":
        return client.create_client_id()

    if args.command == "connect-game":
        return client.connect_game(args.game_id)

    if args.command == "get-game-info":
        return client.get_game_info_merged(args.game_id)

    if args.command == "set-strength":
        return client.set_strength(args.game_id, args.channel, args.strength)

    if args.command == "increase-strength":
        return client.increase_strength(args.game_id, args.channel, args.amount)

    if args.command == "decrease-strength":
        return client.decrease_strength(args.game_id, args.channel, args.amount)

    if args.command == "get-pulse":
        return client.get_pulse(args.game_id, args.channel)

    if args.command == "set-pulse":
        return client.set_pulse(args.game_id, args.channel, args.pulse_id)

    if args.command == "get-pulse-list":
        return client.get_pulse_list(args.game_id, full=args.full)

    if args.command == "fire-action":
        return client.fire_action(
            game_id=args.game_id,
            channel=args.channel,
            strength=args.strength,
            time_ms=args.time,
            override=args.override,
            pulse_id=args.pulse_id,
        )

    raise ValueError(f"Unknown command: {args.command}")


def print_json(data: Dict[str, Any], compact: bool) -> None:
    if compact:
        print(json.dumps(data, ensure_ascii=False))
        return
    print(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False))


def main() -> int:
    args = parse_args()
    client = CoyoteHttpClient(base_url=args.base_url, timeout=args.timeout)

    try:
        result = run_command(client, args)
    except HttpApiError as exc:
        print_json({"status": 0, "code": "ERR::HTTP_CLIENT", "message": str(exc)}, compact=False)
        return 1
    except Exception as exc:  # pylint: disable=broad-except
        print_json({"status": 0, "code": "ERR::UNEXPECTED", "message": str(exc)}, compact=False)
        return 1

    print_json(result, compact=args.compact)
    if isinstance(result, dict) and result.get("status") not in (None, 1):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
