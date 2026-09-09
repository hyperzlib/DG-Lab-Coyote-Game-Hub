import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CURRENT_GAME_CONFIG_SCHEMA_VERSION,
    GameCustomPulseConfigSchema,
    MainGameConfigSchema,
} from '../src/types/game.ts';

const mainConfig = {
    schemaVersion: CURRENT_GAME_CONFIG_SCHEMA_VERSION,
    strengthChangeInterval: [15, 30],
    bChannelMode: 'off' as const,
    bChannelStrengthMultiplier: 1,
    pulse: {
        main: { pulseId: 'default', firePulseId: null, pulseMode: 'single' as const, pulseChangeInterval: 60 },
        channelB: { pulseId: 'default', firePulseId: null, pulseMode: 'single' as const, pulseChangeInterval: 60 },
    },
    fireStrengthLimit: { main: 30, channelB: 30 },
};

test('配置 schema 接受当前版本', () => {
    assert.equal(MainGameConfigSchema.parse(mainConfig).schemaVersion, CURRENT_GAME_CONFIG_SCHEMA_VERSION);
    assert.equal(MainGameConfigSchema.parse({ ...mainConfig, bChannelStrengthMultiplier: 0.01 }).bChannelStrengthMultiplier, 0.01);
    assert.equal(GameCustomPulseConfigSchema.parse({
        schemaVersion: CURRENT_GAME_CONFIG_SCHEMA_VERSION,
        customPulseList: [],
    }).schemaVersion, CURRENT_GAME_CONFIG_SCHEMA_VERSION);
});

test('配置 schema 拒绝缺失或错误版本', () => {
    const missingVersion = { ...mainConfig } as Record<string, unknown>;
    delete missingVersion.schemaVersion;

    assert.throws(() => MainGameConfigSchema.parse(missingVersion));
    assert.throws(() => MainGameConfigSchema.parse({ ...mainConfig, schemaVersion: 0 }));
    assert.throws(() => MainGameConfigSchema.parse({ ...mainConfig, bChannelStrengthMultiplier: 0 }));
    assert.throws(() => GameCustomPulseConfigSchema.parse({ customPulseList: [] }));
    assert.throws(() => GameCustomPulseConfigSchema.parse({
        schemaVersion: 0,
        customPulseList: [],
    }));
});
