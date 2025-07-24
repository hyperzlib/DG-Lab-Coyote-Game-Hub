export class ProviderIdMismatchError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "ProviderIdMismatchError";
    }
}