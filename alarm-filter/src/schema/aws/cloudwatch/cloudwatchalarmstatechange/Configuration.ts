
import { ConfigurationItem } from './ConfigurationItem';

export class Configuration {
  'metrics': Array<ConfigurationItem>;
  'description': string;
  'alarmRule': string;
  'actionsSuppressor': string;
  'actionsSuppressorWaitPeriod': number;
  'actionsSuppressorExtensionPeriod': number;

    private static discriminator: string | undefined = undefined;

    private static attributeTypeMap: Array<{name: string, baseName: string, type: string}> = [
        {
            "name": "metrics",
            "baseName": "metrics",
            "type": "Array<ConfigurationItem>"
        },
        {
            "name": "description",
            "baseName": "description",
            "type": "string"
        },
        {
            "name": "alarmRule",
            "baseName": "alarmRule",
            "type": "string"
        },
        {
            "name": "actionsSuppressor",
            "baseName": "actionsSuppressor",
            "type": "string"
        },
        {
            "name": "actionsSuppressorWaitPeriod",
            "baseName": "actionsSuppressorWaitPeriod",
            "type": "number"
        },
        {
            "name": "actionsSuppressorExtensionPeriod",
            "baseName": "actionsSuppressorExtensionPeriod",
            "type": "number"
        }    ];

    public static getAttributeTypeMap() {
        return Configuration.attributeTypeMap;
    }
}




