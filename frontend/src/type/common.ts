export enum CoyoteDeviceVersion {
    V2 = 2,
    V3 = 3,
    SIMULATOR = 100,
}

export enum ConnectorType {
    DGLAB = 'DGLab',
    COYOTE_BLE_V2 = 'CoyoteBLEV2',
    COYOTE_BLE_V3 = 'CoyoteBLEV3',
}

export type Channelify<T> = {
    main: T;
    channelB: T;
}

const cloneChannelValue = <T>(value: T): T => {
    if (value !== null && typeof value === 'object') {
        return structuredClone(value);
    }
    return value;
};

export const channelifyDefault = <T>(defaultValue: T): Channelify<T> => ({
    main: cloneChannelValue(defaultValue),
    channelB: cloneChannelValue(defaultValue),
});
