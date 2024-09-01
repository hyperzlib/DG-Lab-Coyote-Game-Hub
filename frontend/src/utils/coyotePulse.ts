export type CoyoteRawPulseData = {
    frequency: number[];
    strength: number[];
};

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

export function parseCoyotePulseHex(pulseHex: string[]): CoyoteRawPulseData {
    let freqData: number[] = [];
    let strengthData: number[] = [];

    for (let singlePulseHex of pulseHex) {
        if (singlePulseHex.length !== 16) {
            throw new Error('Invalid pulse hex string.');
        }

        // split the hex string into 2 bytes
        let pulseData = new Uint8Array(8);
        for (let i = 0; i < 8; i ++) {
            const offset = i * 2;
            let byte = singlePulseHex.slice(offset, offset + 2);
            pulseData[i] = parseInt(byte, 16);
        }

        // { frequency: number[4], strength: number[4] }
        for (let i = 0; i < 4; i ++) {
            freqData.push(dgLabFreqFromUint8(pulseData[i]));
            strengthData.push(pulseData[i + 4]);
        }
    }

    return { frequency: freqData, strength: strengthData };
}

export function generatePulseSVG(pulseData: CoyoteRawPulseData): string {
    const linesPerPulse = 5;
    const pulseSegmentWidth = 10;
    const pulseSegmentHeight = 260;

    let svgData: string[] = [];
    
    for (let i = 0; i < pulseData.frequency.length; i ++) {
        let freq = pulseData.frequency[i];
        let strength = pulseData.strength[i];

        let height = strength / 100 * pulseSegmentHeight;

        let x = i * pulseSegmentWidth;
        let y = pulseSegmentHeight - height;

        if (freq === 10) {
            // 输出整个矩形
            svgData.push(`<rect x="${x}" y="${y}" width="${pulseSegmentWidth + 0.5}" height="${height}" fill="currentColor" />`);
        } else {
            // 每个segment分成4个pulse
            let pulseNumPerSegment = Math.ceil(100 / freq * 2);

            let currentPulseNum = 0;
            if (pulseNumPerSegment < 4) {
                if (i % pulseNumPerSegment === 0) {
                    currentPulseNum = 1;
                } else {
                    currentPulseNum = 0;
                }
            } else {
                // 银行家舍入法
                if (i % 2 === 0) {
                    currentPulseNum = Math.floor(pulseNumPerSegment / 2);
                } else {
                    currentPulseNum = Math.ceil(pulseNumPerSegment / 2);
                }
            }

            let gap = Math.floor(linesPerPulse / currentPulseNum);
            for (let j = 0; j < currentPulseNum; j ++) {
                let currentX = x + j * gap;
                svgData.push(`<rect x="${currentX}" y="${y}" width="${2}" height="${height}" fill="currentColor" />`);
            }
        }
    }

    const svgWidth = pulseData.frequency.length * pulseSegmentWidth;
    const svgHeight = pulseSegmentHeight;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" shape-rendering="crispEdges">${svgData.join('')}</svg>`;
}