import { DGLabPulseInfo, DGLabRawPulseData } from './types';

export const PULSE_WINDOW = 100; // 100ms
export const PULSE_POINT_TIME = 25; // 25ms

export function hexToBuffer(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

export function bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

function interp(x: number[], dstLen: number): number[] {
    const srcLen = x.length - 1;
    const step = srcLen / (dstLen - 1);
    const y = new Array(dstLen).fill(0);
    
    for (let i = 0; i < dstLen; i++) {
        const srcIndex = i * step;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.ceil(srcIndex);
        if (srcIndexFloor === srcIndexCeil) {
            y[i] = x[srcIndexFloor];
        } else {
            y[i] = x[srcIndexFloor] + (x[srcIndexCeil] - x[srcIndexFloor]) * (srcIndex - srcIndexFloor);
        }
    }

    return y;
};

export function dgLabFreqToUint8(freq: number): number {
    if (freq === 0) {
        return 0;
    } else if (freq < 10) {
        return 10;
    } else if (freq >= 10 && freq <= 100) {
        return freq;
    } else if (freq > 100 && freq <= 600) {
        return Math.floor((freq - 100) / 5) + 100;
    } else if (freq > 600 && freq <= 1000) {
        return Math.floor((freq - 600) / 10) + 200;
    } else {
        return 0;
    }
}

export function dgLabFreqFromUint8(value: number): number {
    if (value === 0) {
        return 0;
    } else if (value < 10) {
        return 10;
    } else if (value <= 100) {
        return value;
    } else if (value <= 200) {
        return (value - 100) * 5 + 100;
    } else if (value <= 240) {
        return (value - 200) * 10 + 600;
    } else {
        return 0;
    }
}

export function encodeRawPulseData(rawData: DGLabRawPulseData): string {
    let outputArr = new Uint8Array(8);
    for (let i = 0; i < 4; i++) {
        outputArr[i] = dgLabFreqToUint8(rawData.freq[i]);
        outputArr[i + 4] = rawData.value[i];
    }
    return bufferToHex(outputArr).toUpperCase();
}

export function decodeRawPulseData(data: string): DGLabRawPulseData {
    if (data.length !== 16) {
        throw new Error('Invalid data length');
    }
    const buffer = hexToBuffer(data);
    return {
        freq: Array.from(new Uint8Array(buffer.subarray(0, 4))).map(dgLabFreqFromUint8),
        value: Array.from(new Uint8Array(buffer.subarray(4, 8))),
    };
}

export function generateDGLabHexPulse(pulse: DGLabPulseInfo) {
    const sections = pulse.sections;

    let speedFactor = pulse.speedFactor ?? 1;

    let freqList: number[] = [];
    let valueList: number[] = [];

    for (const section of sections) { // 按小节生成
        let sectionRealTime = section.pulse.length * PULSE_WINDOW;
        /** 重复次数 */
        let repeat = Math.max(1, Math.ceil(section.sectionTime * 1000 / sectionRealTime));
        /** 总脉冲数 */
        let totalPulseNum = section.pulse.length * repeat;
        
        let sectionValueList: number[] = [];
        let sectionFreqList: number[] = [];

        let freqConf: [number, number] = typeof section.freq === 'number' ? [section.freq, section.freq] : section.freq;
        switch (section.freqMode) {
            case 'inSection':
                // 节内渐变
                sectionFreqList = interp(freqConf, totalPulseNum);
                break;
            case 'inPulse': {
                // 每个脉冲内渐变（元内渐变）
                let subFreqList = interp(freqConf, section.pulse.length);
                for (let i = 0; i < repeat; i++) {
                    sectionFreqList.push(...subFreqList);
                }
                break;
            }
            case 'perPulse': {
                // 节内每组脉冲渐变（元间渐变）
                let subFreqList = interp(freqConf, repeat);
                for (let freq of subFreqList) {
                    for (let j = 0; j < section.pulse.length; j++) {
                        sectionFreqList.push(freq);
                    }
                }
                break;
            }
            case false:
            default:
                // 固定频率
                sectionFreqList = new Array(totalPulseNum).fill(freqConf[0]);
                break;
        }

        for (let i = 0; i < repeat; i++) {
            sectionValueList.push(...section.pulse);
        }
        
        freqList.push(...sectionFreqList);
        valueList.push(...sectionValueList);
    }

    let pointRepeatNum = 4;
    if (speedFactor === 2) {
        pointRepeatNum = 2;
    } else if (speedFactor === 4) {
        pointRepeatNum = 1;
    }

    let finalFreqList: number[] = [];
    let finalValueList: number[] = [];

    for (let i = 0; i < freqList.length; i++) {
        for (let j = 0; j < pointRepeatNum; j++) {
            finalFreqList.push(freqList[i]);
            finalValueList.push(valueList[i]);
        }
    }

    // 通过生成空白脉冲来实现休息时间
    if (pulse.sleepTime) {
        let sleepPulseNum = Math.ceil(pulse.sleepTime * 1000 / PULSE_WINDOW) * 4;
        for (let i = 0; i < sleepPulseNum; i++) {
            finalFreqList.push(10);
            finalValueList.push(0);
        }
    }

    // 补齐为4的倍数
    if (finalFreqList.length % 4 !== 0) {
        let padLen = 4 - finalFreqList.length % 4;
        for (let i = 0; i < padLen; i++) {
            finalFreqList.push(10);
            finalValueList.push(0);
        }
    }

    // 生成脉冲数据
    let pulseHexList: string[] = [];
    for (let startIndex = 0; startIndex < finalFreqList.length; startIndex += 4) {
        let freqSlice = finalFreqList.slice(startIndex, startIndex + 4);
        let valueSlice = finalValueList.slice(startIndex, startIndex + 4);
        pulseHexList.push(encodeRawPulseData({ freq: freqSlice, value: valueSlice }));
    }

    return pulseHexList;
}