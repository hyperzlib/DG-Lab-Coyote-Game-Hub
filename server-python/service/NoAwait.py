from __future__ import annotations
from asyncio import AbstractEventLoop, Task
import asyncio
import atexit
from functools import wraps
import random

import sys
import traceback
from typing import Callable, Coroutine, Optional, TypedDict

class TimerInfo(TypedDict):
    id: int
    callback: Callable
    interval: float
    next_time: float

class NoAwaitPool:
    def __init__(self, loop: AbstractEventLoop):
        self.task_list: list[Task] = []
        self.timer_map: dict[int, TimerInfo] = {}
        self.loop = loop
        self.running = True

        self.should_refresh_task = False
        self.next_timer_time: Optional[float] = None

        self.on_error: list[Callable] = []

        self.gc_task = loop.create_task(self._run_gc())
        self.timer_task = loop.create_task(self._run_timer())

        atexit.register(self.end_task)

    async def end(self):
        if self.running:
            print("Stopping NoAwait Tasks...")
            self.running = False
            for task in self.task_list:
                await self._finish_task(task)
            
            await self.gc_task
            await self.timer_task

    def end_task(self):
        if self.running and not self.loop.is_closed():
            self.loop.run_until_complete(self.end())
    
    async def _wrap_task(self, task: Task):
        try:
            await task
        except Exception as e:
            handled = False
            for handler in self.on_error:
                try:
                    handler_ret = handler(e)
                    await handler_ret
                    handled = True
                except Exception as handler_err:
                    print("Exception on error handler: " + str(handler_err), file=sys.stderr)
                    traceback.print_exc()

            if not handled:
                print(e, file=sys.stderr)
                traceback.print_exc()
        finally:
            self.should_refresh_task = True

    def add_task(self, coroutine: Coroutine):
        task = self.loop.create_task(coroutine)
        self.task_list.append(task)

    def add_timer(self, callback: Callable, interval: float) -> int:
        id = random.randint(0, 1000000000)
        while id in self.timer_map:
            id = random.randint(0, 1000000000)

        now = self.loop.time()
        next_time = now + interval
        self.timer_map[id] = {
            "id": id,
            "callback": callback,
            "interval": interval,
            "next_time": next_time
        }

        if self.next_timer_time is None or next_time < self.next_timer_time:
            self.next_timer_time = next_time
            
        return id
    
    def remove_timer(self, id: int):
        if id in self.timer_map:
            del self.timer_map[id]

    def wrap(self, f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            coroutine = f(*args, **kwargs)
            self.add_task(coroutine)
        
        return decorated_function

    async def _finish_task(self, task: Task):
        try:
            if not task.done():
                task.cancel()
            await task
        except Exception as e:
            handled = False
            for handler in self.on_error:
                try:
                    handler_ret = handler(e)
                    await handler_ret
                    handled = True
                except Exception as handler_err:
                    print("Exception on error handler: " + str(handler_err), file=sys.stderr)
                    traceback.print_exc()

            if not handled:
                print(e, file=sys.stderr)
                traceback.print_exc()

    async def _run_gc(self):
        while self.running:
            if self.should_refresh_task:
                should_remove = []
                for task in self.task_list:
                    if task.done():
                        await self._finish_task(task)
                        should_remove.append(task)
                for task in should_remove:
                    self.task_list.remove(task)

            await asyncio.sleep(0.1)

    async def _run_timer(self):
        while self.running:
            now = self.loop.time()
            if self.next_timer_time is not None and now >= self.next_timer_time:
                self.next_timer_time = None
                for timer in self.timer_map.values():
                    if now >= timer["next_time"]:
                        timer["next_time"] = now + timer["interval"]
                        try:
                            result = timer["callback"]()
                            self.add_task(result)
                        except Exception as e:
                            handled = False
                            for handler in self.on_error:
                                try:
                                    handler_ret = handler(e)
                                    self.add_task(handler_ret)
                                    handled = True
                                except Exception as handler_err:
                                    print("Exception on error handler: " + str(handler_err), file=sys.stderr)
                                    traceback.print_exc()

                            if not handled:
                                print(e, file=sys.stderr)
                                traceback.print_exc()
                    if self.next_timer_time is None or timer["next_time"] < self.next_timer_time:
                        self.next_timer_time = timer["next_time"]
            
            await asyncio.sleep(0.1)