import { defineStore } from 'pinia'

export const useChartValueStore = defineStore('chartValue', {
    state: () => ({
        strength: 0,
        randomStrength: 0,
        temporaryStrength: 0,
        strengthLimit: 0,
        gameStarted: false,
    }),
    getters: {
        valLow: (state) => Math.min(state.strength + state.temporaryStrength, state.strengthLimit),
        valHigh: (state) => Math.min(state.strength + state.temporaryStrength + state.randomStrength, state.strengthLimit),
        valLimit: (state) => state.strengthLimit,
    },
});