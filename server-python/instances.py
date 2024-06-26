import asyncio

from server.service.NoAwait import NoAwaitPool

loop = asyncio.new_event_loop()
noawait = NoAwaitPool(loop)