import {
    readBarcodesFromImageFile,
    ReaderOptions,
    setZXingModuleOverrides,
} from 'zxing-wasm';
import Pako from 'pako';
import { fromBase64 } from 'js-base64';
import { DGLabPulseInfo, DGLabPulseSectionInfo } from './types';
import { hexToBuffer } from './DGLabPulseHelper';

// Load ZXing WASM module locally
setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => {
        if (path.endsWith(".wasm")) {
            return 'lib/' + path;
        }
        return prefix + path;
    },
});

export function *range(start: number, end: number, step: number = 1): Generator<number> {
    for (let i = start; i < end; i += step) {
        yield i;
    }
}

export function *repeat<T>(value: T, times: number): Generator<T> {
    for (let i = 0; i < times; i++) {
        yield value;
    }
}

/** 频率滑块和真实频率的映射值 */
export const FREQ_SLIDER_VALUE_MAP = [
    ...range(10, 50, 1),
    ...range(50, 80, 2),
    ...range(80, 100, 5),
    ...range(100, 200, 10),
    200, 233, 266, 300, 333, 366,
    ...range(400, 600, 50),
    ...range(600, 1001, 100),
];

/** 小节时长滑块和真实值的映射 */
export const SECTION_TIME_MAP = [
    ...repeat(0.1, 5),
    ...repeat(0.2, 3),
    ...repeat(0.3, 3), 
    ...repeat(0.4, 2),
    ...repeat(0.5, 2),
    ...repeat(0.6, 2),
    ...repeat(0.7, 2),
    0.8,
    ...repeat(0.9, 2),
    1,
    ...repeat(1.1, 2),
    1.2,
    ...repeat(1.3, 2),
    1.4, 1.5,
    ...repeat(1.6, 2),
    1.7, 1.8, 1.9, 2.0,
    ...repeat(2.1, 2),
    2.2, 2.3, 2.4, 2.5,
    2.6, 2.7, 2.8, 2.9, 3.0,
    3.1, 3.2, 3.3, 3.4, 3.5,
    3.6, 3.7, 3.8, 3.9, 4.1,
    4.2, 4.3, 4.4, 4.5, 4.6,
    4.7, 4.9, 5.0, 5.1, 5.2,
    5.4, 5.5, 5.6, 5.7, 5.9,
    6.0, 6.1, 6.3, 6.4, 6.5,
    6.7, 6.8, 6.9, 7.1, 7.2,
    7.4, 7.5, 7.6, 7.8, 7.9,
    8.1, 8.2, 8.4, 8.5, 8.7,
    8.8, 9.0, 9.1, 9.3, 9.4,
    9.6, 9.7, 9.9, 10.0,
];

export function freqFromSliderValue(value: number): number {
    if (value < 0 || value >= FREQ_SLIDER_VALUE_MAP.length) {
        return 10;
    }
    return FREQ_SLIDER_VALUE_MAP[value];
}

export async function loadQRCode(imgFile: File): Promise<string> {
    const readerOptions: ReaderOptions = {
        tryHarder: true,
        formats: ["QRCode"],
        maxNumberOfSymbols: 1,
    };
    const readResults = await readBarcodesFromImageFile(imgFile, readerOptions);

    if (readResults.length === 0) {
        throw new Error('No QR code found');
    }

    return readResults[0].text;
}

export async function parseDGLabPulseUrl(url: string): Promise<DGLabPulseInfo> {
    if (!url.includes('#DGLAB-PULSE#')) {
        throw new Error('Invalid QR code, not a DG Lab Pulse QR code');
    }
    
    let pulseHex = url.split('#DGLAB-PULSE#')[1];
    let pulseBuffer = hexToBuffer(pulseHex);

    // inflate
    let pulseBase64 = Pako.ungzip(pulseBuffer, { to: 'string' });

    let pulseStr = fromBase64(pulseBase64);
    let pulseRawDataChunks = pulseStr.split('+');

    if (pulseRawDataChunks.length < 2) {
        throw new Error('Invalid pulse data');
    }

    let pulseInfoRaw = pulseRawDataChunks[0].split(',');

    // 0-6 频率滑块值
    let freqList: number[][] = [];
    for (let i = 0; i < 3; i++) {
        let freqSlider1 = parseInt(pulseInfoRaw[i]);
        let freqSlider2 = parseInt(pulseInfoRaw[i + 3]);
        freqList.push([
            freqFromSliderValue(freqSlider1), 
            freqFromSliderValue(freqSlider2),
        ]);
    }

    // 6-9 脉冲数
    let pulseNumList: number[] = [];
    for (let i = 6; i < 9; i++) {
        pulseNumList.push(parseInt(pulseInfoRaw[i]));
    }

    // 9-12 小节时长
    let sectionTimeList: number[] = [];
    for (let i = 9; i < 12; i++) {
        const sectionTimeSlider = parseInt(pulseInfoRaw[i]);
        sectionTimeList.push(SECTION_TIME_MAP[sectionTimeSlider]);
    }

    // 12-15 频率模式
    let freqModeList: (false | 'inSection' | 'inPulse' | 'perPulse')[] = [];
    for (let i = 12; i < 15; i++) {
        const freqModeNum = pulseInfoRaw[i];
        switch (freqModeNum) {
            case '1':
                freqModeList.push(false);
                break;
            case '2':
                freqModeList.push('inSection');
                break;
            case '3':
                freqModeList.push('inPulse');
                break;
            case '4':
                freqModeList.push('perPulse');
                break;
        }
    }

    let sectionEnabled = [true, false, false];
    // 15-17 2-3小节开关
    for (let i = 15; i < 17; i++) {
        let sectionIndex = i - 14; // 1-2
        sectionEnabled[sectionIndex] = pulseInfoRaw[i] === '1';
    }

    let sleepTimeRaw = parseInt(pulseInfoRaw[17]);
    let sleepTime = 0;
    if (sleepTimeRaw === 0) {
        sleepTime = 0;
    } else {
        sleepTime = Math.floor((sleepTimeRaw - 1) / 10) / 10 + 0.1;
    }

    // let unknown = parseInt(pulseInfoRaw[18]);
    let speedFactor = parseInt(pulseInfoRaw[19]);

    // 解析脉冲信息
    let sectionList: DGLabPulseSectionInfo[] = [];
    for (let i = 0; i < 3; i++) {
        if (!sectionEnabled[i]) {
            continue;
        }

        let pulseDataRawStr = pulseRawDataChunks[i + 1];
        if (!pulseDataRawStr) {
            continue;
        }

        let pulseDataRaw = pulseDataRawStr.split(',');

        let pulseData = pulseDataRaw.map((item) => {
            let t = item.split('-');
            if (t.length === 1) {
                return parseInt(t[0]) * 5;
            } else {
                return parseInt(t[1]) * 5;
            }
        });

        // padding
        if (pulseData.length < pulseNumList[i]) {
            pulseData.push(...new Array(pulseNumList[i] - pulseData.length).fill(0));
        }

        let freqMode = freqModeList[i];
        let freqRaw = freqList[i];
        let freq: number | [number, number];

        if (!freqMode) {
            freq = freqRaw[0];
        } else {
            freq = [freqRaw[0], freqRaw[1]];
        }

        sectionList.push({
            pulse: pulseData,
            sectionTime: sectionTimeList[i],
            freq,
            freqMode: freqMode,
        });
    }

    return {
        sections: sectionList,
        sleepTime,
        speedFactor,
    } as DGLabPulseInfo;
}

export async function loadDGLabPulseQRCode(imgFile: File): Promise<DGLabPulseInfo> {
    let url = await loadQRCode(imgFile);
    return await parseDGLabPulseUrl(url);
}
