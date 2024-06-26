import { EventEmitter } from 'events';
import deepEqual from 'deep-equal';
import { Channel } from '../../types/dg';
import { DGLabPulseService } from '../../services/DGLabPulse';
import { Task } from '../../utils/task';
import { asleep, randomInt } from '../../utils/utils';
import { EventStore } from '../../utils/EventStore';
import { CoyoteLiveGameManager } from '../../managers/CoyoteLiveGameManager';
export class CoyoteLiveGame {
    client;
    randomStrengthConfig = {
        minStrength: 0,
        maxStrength: 0,
        minInterval: 10,
        maxInterval: 20,
        bChannelMultiplier: 0,
    };
    currentPulse;
    eventStore = new EventStore();
    events = new EventEmitter();
    gameTask = null;
    get gameConfig() {
        return {
            strength: this.randomStrengthConfig,
            pulseId: this.currentPulse.id,
        };
    }
    get clientStrength() {
        return this.client.strength;
    }
    constructor(client) {
        this.client = client;
        this.currentPulse = DGLabPulseService.instance.getDefaultPulse();
    }
    async initialize() {
        // 从缓存中恢复游戏状态
        const configCachePrefix = `coyoteLiveGameConfig:${this.client.clientId}:`;
        const configCache = CoyoteLiveGameManager.instance.configCache;
        let hasCachedConfig = false;
        let cachedRandomStrengthConfig = configCache.get(`${configCachePrefix}:strength`);
        if (cachedRandomStrengthConfig) {
            this.randomStrengthConfig = cachedRandomStrengthConfig;
            hasCachedConfig = true;
        }
        let cachedPulseId = configCache.get(`${configCachePrefix}:pulseId`);
        if (cachedPulseId) {
            let cachedPulse = DGLabPulseService.instance.getPulse(cachedPulseId);
            if (cachedPulse) {
                this.currentPulse = cachedPulse;
                hasCachedConfig = true;
            }
        }
        if (hasCachedConfig) { // 有缓存配置时需要通知客户端
            this.handleConfigUpdated();
        }
        // 在断线时结束游戏
        const clientEvents = this.eventStore.wrap(this.client);
        clientEvents.on('close', () => {
            this.destroy().catch((error) => {
                console.error('Failed to destroy CoyoteLiveGame:', error);
            });
        });
        // 监听强度上报事件
        clientEvents.on('strengthChanged', (strength, _) => {
            let configUpdated = false;
            if (strength.strength === 0) { // 强度为0时停止游戏
                this.stopGame().catch((error) => {
                    console.error('Failed to stop CoyoteLiveGame:', error);
                });
            }
            else if (strength.strength < this.randomStrengthConfig.minStrength) { // 强度低于随机强度时降低随机强度
                const newMinStrength = strength.strength;
                const deltaStrength = this.randomStrengthConfig.minStrength - newMinStrength;
                this.randomStrengthConfig.minStrength = newMinStrength;
                this.randomStrengthConfig.maxStrength -= deltaStrength;
                configUpdated = true;
            }
            if (strength.limit < this.randomStrengthConfig.maxStrength) { // 强度上限小于随机强度上限时降低随机强度上限
                this.randomStrengthConfig.maxStrength = strength.limit;
                configUpdated = true;
            }
            this.events.emit('strengthChanged', strength);
            if (configUpdated) {
                this.handleConfigUpdated();
            }
        });
    }
    on = this.events.on;
    once = this.events.once;
    off = this.events.off;
    get enabled() {
        return this.gameTask?.running ?? false;
    }
    /**
     * 更新游戏配置
     * @param config
     */
    updateConfig(config) {
        let configUpdated = false;
        if (!deepEqual(config.strength, this.randomStrengthConfig)) {
            this.randomStrengthConfig = config.strength;
            configUpdated = true;
        }
        if (config.pulseId !== this.currentPulse.id) {
            let pulse = DGLabPulseService.instance.getPulse(config.pulseId);
            if (pulse) {
                this.currentPulse = pulse;
                configUpdated = true;
            }
        }
        if (configUpdated) {
            this.handleConfigUpdated();
            this.restartGame().catch((error) => {
                console.error('Failed to restart CoyoteLiveGame:', error);
            });
        }
    }
    handleConfigUpdated() {
        this.events.emit('configUpdated', this.gameConfig);
    }
    async runGameTask(ab, harvest) {
        let nextRandomStrengthTime = randomInt(this.randomStrengthConfig.minInterval, this.randomStrengthConfig.maxInterval);
        let [pulseData, pulseDuration] = DGLabPulseService.instance.buildPulse(this.currentPulse);
        // 输出脉冲，直到下次随机强度时间
        let totalDuration = 0;
        for (let i = 0; i < 50; i++) {
            await this.client.sendPulse(Channel.A, pulseData);
            if (this.randomStrengthConfig && this.randomStrengthConfig.bChannelMultiplier) {
                await this.client.sendPulse(Channel.B, pulseData);
            }
            totalDuration += pulseDuration;
            if (totalDuration > nextRandomStrengthTime) {
                break;
            }
        }
        await asleep(totalDuration + 200, ab);
        harvest();
        // 随机强度前先清空当前队列，避免强度突变
        await this.client.clearPulse(Channel.A);
        if (this.randomStrengthConfig.bChannelMultiplier) {
            await this.client.clearPulse(Channel.B);
        }
        harvest();
        // 随机强度
        let strength = randomInt(this.randomStrengthConfig.minStrength, this.randomStrengthConfig.maxStrength);
        await this.client.setStrength(Channel.A, strength);
        if (this.randomStrengthConfig.bChannelMultiplier) {
            await this.client.setStrength(Channel.B, strength * this.randomStrengthConfig.bChannelMultiplier);
        }
    }
    /**
     * 开启游戏
     * @param ignoreEvent
     */
    async startGame(ignoreEvent = false) {
        if (!this.gameTask) {
            // 初始化强度和脉冲
            const minStrength = this.randomStrengthConfig.minStrength;
            await this.client.setStrength(Channel.A, minStrength);
            if (this.randomStrengthConfig.bChannelMultiplier) {
                await this.client.setStrength(Channel.B, minStrength * this.randomStrengthConfig.bChannelMultiplier);
            }
            else {
                await this.client.setStrength(Channel.B, 0);
            }
            await this.client.clearPulse(Channel.A);
            await this.client.clearPulse(Channel.B);
            this.gameTask = new Task((ab, harvest) => this.runGameTask(ab, harvest));
            this.gameTask.on('error', (error) => {
                console.error('Game task error:', error);
            });
            if (!ignoreEvent) {
                this.events.emit('gameStarted');
            }
        }
    }
    /**
     * 停止或暂停游戏
     * @param ignoreEvent
     */
    async stopGame(ignoreEvent = false) {
        if (this.gameTask) {
            await this.gameTask.abort();
            this.gameTask = null;
            if (!ignoreEvent) {
                this.events.emit('gameStopped');
            }
        }
    }
    /**
     * 重启游戏
     *
     * 每次更新配置后都需要重启游戏
     */
    async restartGame() {
        await this.stopGame(true);
        await this.startGame(true);
    }
    async destroy() {
        console.log('Destroying CoyoteLiveGame');
        if (this.gameTask) {
            await this.gameTask.stop();
        }
        // 保存配置, 以便下次连接时恢复
        const configCachePrefix = `coyoteLiveGameConfig:${this.client.clientId}:`;
        const configCache = CoyoteLiveGameManager.instance.configCache;
        configCache.set(`${configCachePrefix}:strength`, this.randomStrengthConfig);
        configCache.set(`${configCachePrefix}:pulseId`, this.currentPulse.id);
        this.events.emit('close');
    }
}
