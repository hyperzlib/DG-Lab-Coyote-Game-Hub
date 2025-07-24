export class FixedLenList<T> {
    private items: T[];
    private maxLength: number;

    constructor(maxLength: number) {
        this.maxLength = maxLength;
        this.items = [];
    }

    public push(item: T): void {
        if (this.items.length >= this.maxLength) {
            this.items.shift(); // Remove the oldest item
        }
        this.items.push(item);
    }

    public unshift(item: T): void {
        if (this.items.length >= this.maxLength) {
            this.items.pop(); // Remove the newest item
        }
        this.items.unshift(item);
    }

    public pop(): T | undefined {
        return this.items.pop();
    }

    public shift(): T | undefined {
        return this.items.shift();
    }

    public getItems(): T[] {
        return [...this.items]; // Return a copy of the items
    }

    public clear(): void {
        this.items = [];
    }

    public get length(): number {
        return this.items.length;
    }
}