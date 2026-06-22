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

export const channelifyDefault = <T>(defaultValue: T): Channelify<T> => ({
    main: defaultValue,
    channelB: defaultValue,
});