import asyncio
from asyncio import Task
import json
import random
import time
from typing import Optional, Dict
from uuid import uuid4

from aiohttp.web import Request, WebSocketResponse
from pydantic import UUID4
from websockets import ConnectionClosedError

import utils.web

from service.DGLabPulse import DGLabPulseInfo, dglab_pulse
from service.AsyncEventEmitter import SingleAsyncEventEmitter

from pydglab_ws.enums import MessageDataHead, RetCode, MessageType, Channel
from pydglab_ws.models import WebSocketMessage

__all__ = ["DGLabWSController"]


HEARTBEAT_INTERVAL = 5.0
HEARTBEAT_TIMEOUT = 20.0


class RandomStrengthConfig:
    min_strength: int
    max_strength: int
    min_interval: float
    max_interval: float

    b_channel_multiplier: Optional[float]

    def __init__(self, min_strength: int, max_strength: int, min_interval: float, max_interval: float,
                 b_channel_multiplier: Optional[float] = None):
        self.min_strength = min_strength
        self.max_strength = max_strength
        self.min_interval = min_interval
        self.max_interval = max_interval
        self.b_channel_multiplier = b_channel_multiplier


class StrengthInfo:
    strength: int
    limit: int

    def __init__(self, strength: int, limit: int):
        self.strength = strength
        self.limit = limit


class DGLabWSClient:
    def __init__(self, socket: WebSocketResponse, client_id: Optional[str]):
        self.socket: WebSocketResponse = socket

        self.client_id = client_id or uuid4()
        self.target_id = ""

        self.prev_heartbeat_time = time.time()

        self.strength = StrengthInfo(strength=0, limit=0)
        self.strength_b = StrengthInfo(strength=0, limit=0)

        self.websocket_handler_task: Task = None
        self.heartbeat_task: Optional[Task] = None

        self.on_config_changed = SingleAsyncEventEmitter()
        self.on_strength_changed = SingleAsyncEventEmitter()


    async def init(self):
        await self.send(WebSocketMessage(
            type=MessageType.BIND,
            client_id=self.client_id,
            message=MessageDataHead.TARGET_ID
        ))

        self.websocket_handler_task = asyncio.create_task(self.run_websocket_handler_task())

        # 等待绑定成功
        start_time = time.time()
        while not self.target_id:
            await asyncio.sleep(0.5)
            if time.time() - start_time > HEARTBEAT_TIMEOUT:
                raise Exception("Bind timeout")
            
        await self.clear_pulse()
        await asyncio.sleep(0.5)

        self.heartbeat_task = asyncio.create_task(self.run_heartbeat_task())


    async def send(self, message: WebSocketMessage):
        if message.type != MessageType.HEARTBEAT:
            print("send: " + message.model_dump_json(by_alias=True, context={'separators': (',', ':')}))
            
        json_str = message.model_dump_json(by_alias=True, context={"separators": (",", ":")})
        await self.socket.send_str(json_str)


    async def run_heartbeat_task(self):
        while True:
            await self.send(WebSocketMessage(
                type=MessageType.HEARTBEAT,
                client_id=self.client_id,
                target_id=self.target_id,
                message=RetCode.SUCCESS
            ))
            await asyncio.sleep(5)


    async def run_websocket_handler_task(self):
        try:
            async for message in self.socket:
                await self.handle_message(WebSocketMessage.model_validate_json(message.data))
        except ConnectionClosedError:
            print(f"Connection closed: {self.client_id}")

    
    async def handle_message(self, message: WebSocketMessage):
        if message.type == MessageType.BIND:
            if message.message == MessageDataHead.DG_LAB:
                self.target_id = message.target_id
                print(f"Bind success: {self.client_id} -> {self.target_id}")
                await self.send(WebSocketMessage(
                    type=MessageType.BIND,
                    client_id=self.client_id,
                    target_id=self.target_id,
                    message=RetCode.SUCCESS
                ))
            else:
                print(f"Bind failed: {message.message}")
        elif message.type == MessageType.MSG:
            if message.message.startswith("feedback-"):
                print(f"Feedback: {message.message}")
            elif message.message.startswith("strength-"):
                await self.handle_msg_strength_changed(message.message)
        elif message.type == MessageType.HEARTBEAT:
            if message.message == MessageDataHead.DG_LAB:
                print(f"Heartbeat success")
                self.prev_heartbeat_time = time.time()
            else:
                print(f"Heartbeat failed: {message.message}")
        elif message.type == MessageType.BREAK:
            if message.message == RetCode.CLIENT_DISCONNECTED:
                print(f"Client disconnected: {message.client_id}")
            else:
                print(f"Break failed: {message.message}")


    async def handle_msg_strength_changed(self, message: str):
        strength_data = message.split('-')[1].split('+')
        
        self.strength = StrengthInfo(strength=int(strength_data[0]), limit=int(strength_data[2]))
        self.strength_b = StrengthInfo(strength=int(strength_data[1]), limit=int(strength_data[3]))

        print(f"Current strength: {self.strength.strength}/{self.strength.limit}, {self.strength_b.strength}/{self.strength_b.limit}")

        self.on_strength_changed.emit(self.strength, self.strength_b)


    async def set_strength(self, channel: Channel, strength: int):
        if channel == Channel.A:
            if strength > self.strength.limit:
                raise ValueError("Strength out of limit")
        elif channel == Channel.B:
            if strength > self.strength_b.limit:
                raise ValueError("Strength out of limit")

        await self.send(WebSocketMessage(
            type=MessageType.MSG,
            client_id=self.client_id,
            target_id=self.target_id,
            message=MessageDataHead.STRENGTH + f"-{channel.value}+2+{strength}"
        ))


    async def send_pulse(self, channel: Channel, pulse: list[str]):
        pulse_str = json.dumps(pulse)

        channel_id = "A" if channel == Channel.A else "B"

        await self.send(WebSocketMessage(
            type=MessageType.MSG,
            client_id=self.client_id,
            target_id=self.target_id,
            message=f"{MessageDataHead.PULSE.value}-{channel_id}:{pulse_str}"
        ))


    async def clear_pulse(self, channel: Channel):
        channel_id = "A" if channel == Channel.A else "B"

        await self.send(WebSocketMessage(
            type=MessageType.MSG,
            client_id=self.client_id,
            target_id=self.target_id,
            message=f"{MessageDataHead.CLEAR.value}-{channel_id}"
        ))


    async def run(self):
        await self.websocket_handler_task
        await self.close()


    async def close(self):
        if not self.socket.closed:
            await self.socket.close()

        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            await self.heartbeat_task
            self.heartbeat_task = None


class DGLabGameClient(DGLabWSClient):
    def __init__(self, socket: WebSocketResponse, client_id: Optional[str]):
        super().__init__(socket, client_id)

        self.random_strength_config: Optional[RandomStrengthConfig] = None
        self.random_strength_config = RandomStrengthConfig(
            min_strength=10,
            max_strength=20,
            min_interval=10,
            max_interval=15,
            b_channel_multiplier=None
        ) # 测试

        self.next_strength_time = -1

        self.pulse_output_task: Optional[Task] = None

        self.current_pulse: DGLabPulseInfo = None
        self.current_pulse = dglab_pulse.pulse_list[0] # 测试


    async def init(self):
        await super().init()

        self.pulse_output_task = asyncio.create_task(self.run_pulse_output_task())


    async def run_pulse_output_task(self):
        try:
            # 将强度设置为最低
            await self.set_strength(Channel.A, self.random_strength_config.min_strength)

            prev_time = time.time()
            while True:
                if not self.random_strength_config or not self.current_pulse: # 未配置
                    await asyncio.sleep(0.2)
                    continue

                current_time = time.time()

                # 随机强度时间
                random_strength_time = random.uniform(self.random_strength_config.min_interval, self.random_strength_config.max_interval)
                random_strength_time *= 1000
                
                # 输出脉冲
                pulse_data, pulse_duration = dglab_pulse.build_pulse(self.current_pulse)
                
                total_duration = 0
                for _ in range(50):
                    print("Pulse output")
                    await self.send_pulse(Channel.A, pulse_data)
                    if self.random_strength_config and self.random_strength_config.b_channel_multiplier:
                        await self.send_pulse(Channel.B, pulse_data)

                    total_duration += pulse_duration
                    if total_duration > random_strength_time:
                        break

                await asyncio.sleep(total_duration / 1000 + 0.2)

                # 随机强度
                await self.clear_pulse(Channel.A)
                if self.random_strength_config.b_channel_multiplier:
                    await self.clear_pulse(Channel.B)

                strength = random.randint(self.random_strength_config.min_strength, self.random_strength_config.max_strength)
                await self.set_strength(Channel.A, strength)
                if self.random_strength_config.b_channel_multiplier:
                    await self.set_strength(Channel.B, strength * self.random_strength_config.b_channel_multiplier)
                
                if current_time - prev_time < 0.2: # 防止过快调用导致无法运行其他时间切片
                    await asyncio.sleep(0.2)
                
        except Exception as ex:
            print(f"Error in pulse output task: {ex}")
            raise ex
            


class DGLabWSController:
    def __init__(
        self,
    ):
        self._uuid_to_client: Dict[UUID4, DGLabWSClient] = {}
        self._client_id_to_target_id: Dict[UUID4, UUID4] = {}
        self._target_id_to_client_id: Dict[UUID4, UUID4] = {}


    @property
    def client_id_to_target_id(self) -> Dict[UUID4, UUID4]:
        """
        ``client_id`` 到 ``target_id`` 的映射
        """
        return self._client_id_to_target_id.copy()


    @property
    def target_id_to_client_id(self) -> Dict[UUID4, UUID4]:
        """
        ``target_id`` 到 ``client_id`` 的映射
        """
        return self._target_id_to_client_id.copy()


    @property
    def uuid_to_client(self) -> Dict[UUID4, DGLabWSClient]:
        """
        所有的 WebSocket 客户端 ID（包含终端与 App）到 DGLab Client 对象的映射
        """
        return self._uuid_to_client.copy()
    

    async def connection_handler(self, request: Request):
        print("connection_handler", request, request.url)
        client_id = request.match_info.get("id")

        if not client_id:
            return await utils.web.api_response(-1, error="Client ID not provided", http_status=400)

        if client_id in self._uuid_to_client:
            return await utils.web.api_response(-1, error="Client already connected", http_status=400)

        if not utils.web.is_websocket(request):
            return await utils.web.api_response(-1, error="请使用DG-Lab连接", http_status=400)
        
        websocket = WebSocketResponse()
        await websocket.prepare(request)

    
        client = DGLabGameClient(websocket, client_id)

        await client.init()

        # 添加绑定
        self._uuid_to_client[client.client_id] = client
        self._client_id_to_target_id[client.client_id] = client.target_id
        self._target_id_to_client_id[client.target_id] = client.client_id

        await client.run()

    
    async def destory(self):
        for client in self._uuid_to_client.values():
            await client.close()
        self._uuid_to_client.clear()
        self._client_id_to_target_id.clear()
        self._target_id_to_client_id.clear()