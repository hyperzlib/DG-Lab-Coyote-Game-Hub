import asyncio
from typing import Callable
from instances import noawait


class SingleAsyncEventEmitter:
    def __init__(self):
        self.callback_list: list[Callable] = []

    def add(self, callback: Callable):
        self.callback_list.append(callback)

    @noawait.wrap
    async def emit(self, *args, **kwargs):
        await asyncio.gather(*[callback(*args, **kwargs) for callback in self.callback_list])

    async def emit_async(self, *args, **kwargs):
        for callback in self.callback_list:
            await callback(*args, **kwargs)

    def remove(self, callback: Callable):
        self.callback_list.remove(callback)

    def remove_all(self):
        self.callback_list.clear()