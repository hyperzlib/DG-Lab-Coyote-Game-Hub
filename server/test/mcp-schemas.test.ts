import test from 'node:test';
import assert from 'node:assert/strict';
import { FireActionParamsSchema, SetPulseParamsSchema } from '../src/controllers/http/schemas/McpApi.ts';
import { getFireChannelRestriction } from '../src/services/GameApiShared.ts';

test('MCP 支持波形列表和 OpenAPI 开火参数', () => {
    assert.deepEqual(SetPulseParamsSchema.parse({
        channel: 'bChannel',
        pulseId: ['pulse-a', 'pulse-b'],
    }).pulseId, ['pulse-a', 'pulse-b']);

    const fireAction = FireActionParamsSchema.parse({
        channel: 'aChannel',
        strength: 0,
        duration: 300000,
        override: true,
    });

    assert.equal(fireAction.duration, 300000);
    assert.equal(fireAction.override, true);
});

test('非独立模式禁止单独对 B 通道开火', () => {
    assert.equal(getFireChannelRestriction('main', 'sync'), undefined);
    assert.equal(getFireChannelRestriction('channelB', 'discrete'), undefined);
    assert.equal(getFireChannelRestriction('channelB', 'off')?.code, 'ERR::B_CHANNEL_NOT_INDEPENDENT');
    assert.equal(getFireChannelRestriction('channelB', 'sync')?.code, 'ERR::B_CHANNEL_NOT_INDEPENDENT');
});
