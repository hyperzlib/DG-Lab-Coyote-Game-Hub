/**
 * This section defines some constant enums.
 */
export enum MessageType {
    HEARTBEAT = "heartbeat",
    BIND = "bind",
    MSG = "msg",
    BREAK = "break",
    ERROR = "error",
}

export enum RetCode {
    SUCCESS = "200",
    CLIENT_DISCONNECTED = "209",
    INVALID_CLIENT_ID = "210",
    SERVER_DELAY = "211",
    ID_ALREADY_BOUND = "400",
    TARGET_CLIENT_NOT_FOUND = "401",
    INCOMPATIBLE_RELATIONSHIP = "402",
    NON_JSON_CONTENT = "403",
    RECIPIENT_NOT_FOUND = "404",
    MESSAGE_TOO_LONG = "405",
    SERVER_INTERNAL_ERROR = "500",
}

export enum MessageDataHead {
    TARGET_ID = "targetId",
    DG_LAB = "DGLAB",
    STRENGTH = "strength",
    PULSE = "pulse",
    CLEAR = "clear",
    FEEDBACK = "feedback",
}

export enum StrengthOperationType {
    DECREASE = 0,
    INCREASE = 1,
    SET_TO = 2,
}

export enum FeedbackButton {
    A1 = 0,
    A2 = 1,
    A3 = 2,
    A4 = 3,
    A5 = 4,
    B1 = 5,
    B2 = 6,
    B3 = 7,
    B4 = 8,
    B5 = 9,
}

export enum Channel {
    A = 1,
    B = 2,
}

export type DGLabMessage = {
    type: MessageType | string,
    clientId: string,
    targetId: string,
    message: string,
}