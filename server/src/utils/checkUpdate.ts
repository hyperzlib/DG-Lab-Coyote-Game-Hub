import * as fs from 'fs';
import got from 'got';

export type VersionInfo = {
    repo: string;
    version: string;
    description?: string;
    releaseFile: {
        [platform: string]: string;
    }
} & Record<string, any>;

export function compareVersion(current: string, remote: string) {
    const v1s = current.split('.').map(Number);
    const v2s = remote.split('.').map(Number);

    let v1ns = '';
    let v2ns = '';

    for (let i = 0; i < Math.max(v1s.length, v2s.length); i++) {
        let chunk1 = v1s[i] === undefined ? '' : v1s[i].toString();
        let chunk2 = v2s[i] === undefined ? '' : v2s[i].toString();

        let maxLen = Math.max(chunk1.length, chunk2.length);
        chunk1 = chunk1.padStart(maxLen, '0');
        chunk2 = chunk2.padStart(maxLen, '0');

        v1ns += chunk1;
        v2ns += chunk2;
    }

    let v1n = parseInt(v1ns);
    let v2n = parseInt(v2ns);

    if (v2n > v1n) {
        return true;
    } else {
        return false;
    }
}

export async function checkUpdate() {
    const apis = [
        {
            version: 'https://raw.githubusercontent.com/{repo}/master/version.json',
            release: 'https://github.com/{repo}/releases/download/v{version}/{file}',
        },
        // 镜像地址
        {
            version: 'https://mirror.ghproxy.com/https://raw.githubusercontent.com/{repo}/master/version.json',
            release: 'https://mirror.ghproxy.com/https://github.com/{repo}/releases/download/v{version}/{file}',
        },
    ]
    if (!fs.existsSync('version.json')) return false;
    try {
        const versionInfo: VersionInfo = JSON.parse(await fs.promises.readFile('version.json', 'utf8'));
        if (!versionInfo.repo || !versionInfo.version) return false;

        for (const api of apis) {
            try {
                const res = await got(api.version.replace('{repo}', versionInfo.repo), {
                    timeout: 5000,
                }).json<VersionInfo>();

                if (res.version && compareVersion(versionInfo.version, res.version)) {
                    let releaseFile = '';
                    if (process.platform.startsWith('win')) {
                        releaseFile = res.releaseFile.windows;
                    } else if (process.platform.startsWith('linux')) {
                        releaseFile = res.releaseFile.linux;
                    } else if (process.platform.startsWith('darwin')) {
                        releaseFile = res.releaseFile.mac;
                    }

                    console.log(`检测到新版本：${res.version}，更新内容：\n${res.description}\n`);

                    if (releaseFile) {
                        console.log(`下载地址：${api.release.replace('{repo}', res.repo).replace('{version}', res.version).replace('{file}', releaseFile)}`);
                    }
                    
                    return true;
                }
            } catch (e: any) {
                
            }
        }
    } catch (e: any) {
        
    }
}