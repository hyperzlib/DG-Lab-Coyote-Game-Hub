export interface DGLabPulseSectionInfo {
    /** 波形形状 */
    pulse: number[];
    /** 小节时长（秒，用于计算小节重复次数） */
    sectionTime: number;
    /** 频率 */
    freq: number | [number, number];
    /** 频率模式 */
    freqMode?: false | 'inSection' | 'inPulse' | 'perPulse';
}

export type SinglePulse = [frequency: number, value: number];

export interface DGLabPulseInfo {
    sections: DGLabPulseSectionInfo[];
    /** 休息时长（秒） */
    sleepTime?: number;
    /** 播放速率 */
    speedFactor?: number;
}

export interface DGLabRawPulseData {
    freq: number[];
    value: number[];
}