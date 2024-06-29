import { ApiResponse } from "../apis/webApi";

export class ApiError extends Error {
    public response: any;

    constructor(message: string, response: any) {
        super(message);
        this.response = response;
    }

    public get status(): number {
        return this.response?.status ?? -1;
    }

    public toString(): string {
        return `API request failed: ${this.message}`;
    }
};

export function handleApiResponse(response: ApiResponse<any>) {
    if (response.status !== 1) {
        throw new ApiError(response.message ?? 'Unknown error', response);
    }
}