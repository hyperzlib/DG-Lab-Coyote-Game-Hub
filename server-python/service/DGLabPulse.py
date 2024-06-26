import asyncio
import hashlib
import math
import time
import yaml
import os
import re
import aiofiles
from typing import Any, Callable, Coroutine, Optional, TypedDict
from watchdog.observers.api import BaseObserver
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from service.AsyncEventEmitter import SingleAsyncEventEmitter
from instances import noawait, loop

match_file_name = re.compile(r"^((?P<order>\d+)[-_])?(?P<name>.*?)(\.png|\.jpg)$")
pulse_window = 100 # 100ms


class DGLabPulseScript(TypedDict):
    pulse: Optional[list[str]]
    wait: Optional[int]


class DGLabPulseInfo(TypedDict):
    id: str
    name: str
    script: list[DGLabPulseScript]


class DGLabPulseService:
    def __init__(self):
        self.pulse_list: list[DGLabPulseInfo] = []
        self.pulse_config = "data/pulse.yaml"
        
        self.fs_observer: Optional[BaseObserver] = None

        self.on_pulse_updated = SingleAsyncEventEmitter()


    async def initialize(self):
        await self.read_config()
        await self.watch_config()


    async def destory(self):
        if self.fs_observer:
            self.fs_observer.stop()
            self.fs_observer.join()


    def _md5(self, data: str):
        return hashlib.md5(data.encode()).hexdigest()
    

    def _md5_16(self, data: str):
        return self._md5(data)[8:-8]


    async def read_config(self):
        try:
            async with aiofiles.open(self.pulse_config, "r") as f:
                file_content = await f.read()
                self.pulse_list = yaml.safe_load(file_content)
                print("Pulse config loaded")
        except FileNotFoundError:
            pass

        print(self.pulse_list)
        if type(self.pulse_list) != list:
            self.pulse_list = []

    async def watch_config(self):
        class PulseEventHandler(FileSystemEventHandler):
            def __init__(self, service: "DGLabPulseService"):
                self.service = service

            async def on_modified(self, event):
                if event.is_directory:
                    return

                if event.src_path == self.service.pulse_config:
                    await self.service.read_config()
                    print("Pulse config updated")
                    await self.service.on_pulse_updated.emit()

        self.fs_observer = Observer()
        self.fs_observer.schedule(PulseEventHandler(self), self.pulse_config)
        self.fs_observer.start()


    async def run_pulse(self, pulse: DGLabPulseInfo, on_output_pulse: Callable[[list[str]], Coroutine[Any, Any, None]]):
        script = pulse["script"]

        for script_item in script:
            if script_item.get("pulse"):
                pulse_time = pulse_window * len(script_item["pulse"])
                start_time = loop.time()
                await on_output_pulse(script_item["pulse"])
                cost_time = loop.time() - start_time
                
                if cost_time < pulse_time:
                    await asyncio.sleep((pulse_time - cost_time) / 1000)

            if script_item.get("wait"):
                await asyncio.sleep(script_item["wait"] / 1000)


    def build_pulse(self, pulse: list[str]):
        total_duration = 0

        pulse_items: list[str] = []
        script = pulse["script"]

        for script_item in script:
            if script_item.get("pulse"):
                pulse_time = pulse_window * len(script_item["pulse"])
                pulse_items.extend(script_item["pulse"])
                total_duration += pulse_time

            if script_item.get("wait"):
                wait_frames = math.ceil(script_item["wait"] / pulse_window)
                for _ in range(wait_frames):
                    pulse_items.append("0000000000000000")
                total_duration += wait_frames * pulse_window

        return pulse_items, total_duration

dglab_pulse = DGLabPulseService()