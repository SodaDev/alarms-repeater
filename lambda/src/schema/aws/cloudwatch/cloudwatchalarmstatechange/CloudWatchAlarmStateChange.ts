import { Configuration } from './Configuration';
import { State } from './State';

export class CloudWatchAlarmStateChange {
    'configuration': Configuration;
    'state': State;
    'previousState': State;
    'alarmName': string;

    private static discriminator: string | undefined = undefined;

    private static attributeTypeMap: Array<{ name: string; baseName: string; type: string }> = [
        {
            name: 'configuration',
            baseName: 'configuration',
            type: 'Configuration',
        },
        {
            name: 'state',
            baseName: 'state',
            type: 'State',
        },
        {
            name: 'previousState',
            baseName: 'previousState',
            type: 'State',
        },
        {
            name: 'alarmName',
            baseName: 'alarmName',
            type: 'string',
        },
    ];

    public static getAttributeTypeMap() {
        return CloudWatchAlarmStateChange.attributeTypeMap;
    }
}
