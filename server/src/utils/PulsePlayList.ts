export class PulsePlayList {
    public mode: 'single' | 'sequence' | 'random' = 'single';

    public pulseIds: string[] = [];
    public currentIndex = 0;
    
    public changeInterval = 0;

    public nextChangeTime = 0;

    public constructor(pulseIds: string[], mode: 'single' | 'sequence' | 'random' = 'single', interval?: number) {
        this.pulseIds = pulseIds;

        this.mode = mode;

        if (pulseIds.length <= 1) {
            mode = 'single';
        }

        if (mode !== 'single') {
            this.changeInterval = interval || 60;
            this.nextChangeTime = Date.now() + this.changeInterval * 1000;
        }

        if (mode === 'random') {
            this.suffle();
        }
    }

    public getCurrentPulseId(): string {
        if (this.mode === 'single') {
            return this.pulseIds[0];
        }
        
        if (Date.now() > this.nextChangeTime) {
            this.nextChangeTime = Date.now() + this.changeInterval * 1000;
            this.currentIndex ++;

            if (this.currentIndex >= this.pulseIds.length) { // 播放完毕，重新开始
                this.currentIndex = 0;
                if (this.mode === 'random') { // 随机播放时重新洗牌
                    this.suffle();
                }
            }
        }

        return this.pulseIds[this.currentIndex];
    }

    private suffle() {
        this.pulseIds = this.pulseIds.sort(() => Math.random() - 0.5);
    }
}