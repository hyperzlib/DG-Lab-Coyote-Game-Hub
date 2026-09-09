import test from 'node:test';
import assert from 'node:assert/strict';
import { CoyoteGameController } from '../src/controllers/game/CoyoteGameController.ts';
import { Channel } from '../src/types/dg.ts';
import { AbstractGameAction } from '../src/controllers/game/actions/AbstractGameAction.ts';
import { GameFireAction } from '../src/controllers/game/actions/GameFireAction.ts';

class DeferredAction extends AbstractGameAction<{ value: number }> {
    public updateStarted = false;
    public resolveUpdate!: () => void;

    async updateConfig(config: { value: number }): Promise<void> {
        this.updateStarted = true;
        this.config = config;
        await new Promise<void>((resolve) => {
            this.resolveUpdate = resolve;
        });
    }

    async execute(): Promise<void> {}

    isApplicableToChannel(): boolean {
        return true;
    }

    isFinished(): boolean {
        return false;
    }
}

function createSyncGame(multiplier = 0.5, bLimit = 200): CoyoteGameController {
    const game = new CoyoteGameController('test-client');
    game.gameConfig = {
        schemaVersion: 1,
        strengthChangeInterval: [15, 30],
        bChannelMode: 'sync',
        bChannelStrengthMultiplier: multiplier,
        pulse: {
            main: { pulseId: 'main', firePulseId: null, pulseMode: 'single', pulseChangeInterval: 60 },
            channelB: { pulseId: 'channel-b', firePulseId: null, pulseMode: 'single', pulseChangeInterval: 60 },
        },
        fireStrengthLimit: { main: 30, channelB: 30 },
    };
    game.strengthConfig = {
        main: { strength: 30, randomStrength: 20 },
        channelB: { strength: 80, randomStrength: 20 },
    };
    game.clientStrength = {
        main: { strength: 0, limit: 200 },
        channelB: { strength: 0, limit: bLimit },
    };
    return game;
}

test('同步 B 通道使用倍率派生配置和整体开火公式', () => {
    const game = createSyncGame();

    assert.deepEqual(game.getEffectiveStrengthConfig('channelB'), {
        strength: 15,
        randomStrength: 10,
    });
    assert.equal(game.getFireOutputStrength('channelB', 0), 15);
    assert.equal(game.getFireOutputStrength('channelB', 10), 20);
    assert.equal(game.getFireTemporaryStrength('channelB', 10), 5);
});

test('同步 B 通道保留首次强度并逐步增加', () => {
    const game = createSyncGame();

    // 一键开火首次输入强度受 SAFE_FIRE_STRENGTH 限制为30，之后每次增加5。
    assert.equal(game.getFireOutputStrength('channelB', 30), 30);
    assert.equal(game.getFireOutputStrength('channelB', 35), 32);
    assert.equal(game.getFireOutputStrength('channelB', 40), 35);
});

test('同步 B 通道开火强度按设备上限限制', () => {
    const game = createSyncGame(1, 35);

    assert.deepEqual(game.getEffectiveStrengthConfig('channelB'), {
        strength: 30,
        randomStrength: 5,
    });
    assert.equal(game.getFireOutputStrength('channelB', 30), 35);
    assert.equal(game.getFireTemporaryStrength('channelB', 30), 5);
});

test('同步 B 通道倍率为小数时使用 Math.floor', () => {
    const game = createSyncGame(0.33);

    assert.equal(game.getEffectiveStrengthConfig('channelB').strength, 9);
    assert.equal(game.getFireOutputStrength('channelB', 5), 11);
});

test('同步模式下 A 和 B 循环只设置各自的物理通道', async () => {
    const game = createSyncGame();
    const writes: Array<{ channel: Channel, strength: number }> = [];
    game.client = {
        active: true,
        setStrength: async (channel: Channel, strength: number) => {
            writes.push({ channel, strength });
        },
    } as any;

    await game.setClientStrength(40, 'main');
    await game.setClientStrength(20, 'channelB');

    assert.deepEqual(writes, [
        { channel: Channel.A, strength: 40 },
        { channel: Channel.B, strength: 20 },
    ]);
});

test('同步模式下 A 配置更新重启 B 循环，B 配置更新不直接写设备', async () => {
    const game = createSyncGame();
    const writes: Array<{ channel: Channel, strength: number }> = [];
    const reloads: string[] = [];
    game.client = {
        active: true,
        setStrength: async (channel: Channel, strength: number) => {
            writes.push({ channel, strength });
        },
    } as any;
    game.reloadGameTask = async (channel) => {
        reloads.push(channel);
    };

    await game.updateStrengthConfig({ strength: 5, randomStrength: 2 }, 'main');
    await game.updateStrengthConfig({ strength: 90, randomStrength: 20 }, 'channelB');

    assert.deepEqual(writes, [{ channel: Channel.A, strength: 5 }]);
    assert.deepEqual(reloads, ['channelB']);
    assert.deepEqual(game.strengthConfig.channelB, { strength: 90, randomStrength: 20 });
});

test('关闭模式不会设置 B 通道，独立模式仍可设置 B 通道', async () => {
    const game = createSyncGame();
    const writes: Array<{ channel: Channel, strength: number }> = [];
    game.client = {
        active: true,
        setStrength: async (channel: Channel, strength: number) => {
            writes.push({ channel, strength });
        },
    } as any;

    game.gameConfig.bChannelMode = 'off';
    await game.setClientStrength(20, 'channelB');
    game.gameConfig.bChannelMode = 'discrete';
    await game.setClientStrength(20, 'channelB');

    assert.deepEqual(writes, [{ channel: Channel.B, strength: 20 }]);
});

test('复用开火动作时等待异步配置更新完成后再重启输出循环', async () => {
    const game = new CoyoteGameController('test-client');
    const oldAction = new DeferredAction({ value: 1 });
    oldAction._initialize(game);
    game.actionList = [oldAction];

    const events: string[] = [];
    game.reloadGameTask = async () => {
        events.push('reload');
    };

    const updatePromise = game.startAction(new DeferredAction({ value: 2 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    assert.equal(oldAction.updateStarted, true);
    assert.deepEqual(events, []);

    oldAction.resolveUpdate();
    await updatePromise;

    assert.deepEqual(events, ['reload', 'reload']);
    assert.deepEqual(oldAction.config, { value: 2 });
});

test('降低正在开火的强度会立即写入新的 A/B 实际输出', async () => {
    const game = createSyncGame();
    const writes: Array<{ channel: Channel, strength: number }> = [];
    const reloads: string[] = [];
    game.client = {
        active: true,
        setStrength: async (channel: Channel, strength: number) => {
            writes.push({ channel, strength });
        },
    } as any;
    game.reloadGameTask = async (channel) => {
        reloads.push(channel);
    };

    const oldAction = new GameFireAction({
        channel: 'all',
        strength: 30,
        time: 5000,
        updateMode: 'replace',
    });
    oldAction._initialize(game);
    oldAction.currentFireStrength = { main: 30, channelB: 30 };
    game.setTempStrength(30, 'all');
    game.actionList = [oldAction];

    await game.startAction(new GameFireAction({
        channel: 'all',
        strength: 10,
        time: 5000,
        updateMode: 'replace',
    }));

    assert.deepEqual(oldAction.currentFireStrength, { main: 10, channelB: 10 });
    assert.deepEqual(game.tempStrength, { main: 10, channelB: 5 });
    assert.deepEqual(writes, [
        { channel: Channel.A, strength: 40 },
        { channel: Channel.B, strength: 20 },
    ]);
    assert.deepEqual(reloads, ['main', 'channelB']);
});
