export class State {
    'reason': string;
    'reasonData': string;
    'value': string;
    'timestamp': string;
    'actionsSuppressedBy': string;
    'actionsSuppressedReason': string;
    'evaluationState': string;

    private static discriminator: string | undefined = undefined;

    private static attributeTypeMap: Array<{ name: string; baseName: string; type: string }> = [
        {
            name: 'reason',
            baseName: 'reason',
            type: 'string',
        },
        {
            name: 'reasonData',
            baseName: 'reasonData',
            type: 'string',
        },
        {
            name: 'value',
            baseName: 'value',
            type: 'string',
        },
        {
            name: 'timestamp',
            baseName: 'timestamp',
            type: 'string',
        },
        {
            name: 'actionsSuppressedBy',
            baseName: 'actionsSuppressedBy',
            type: 'string',
        },
        {
            name: 'actionsSuppressedReason',
            baseName: 'actionsSuppressedReason',
            type: 'string',
        },
        {
            name: 'evaluationState',
            baseName: 'evaluationState',
            type: 'string',
        },
    ];

    public static getAttributeTypeMap() {
        return State.attributeTypeMap;
    }
}
