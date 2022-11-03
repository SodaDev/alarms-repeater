import { MetricStat } from './MetricStat';

export class ConfigurationItem {
    'metricStat': MetricStat;
    'returnData': boolean;
    'id': string;

    private static discriminator: string | undefined = undefined;

    private static attributeTypeMap: Array<{ name: string; baseName: string; type: string }> = [
        {
            name: 'metricStat',
            baseName: 'metricStat',
            type: 'MetricStat',
        },
        {
            name: 'returnData',
            baseName: 'returnData',
            type: 'boolean',
        },
        {
            name: 'id',
            baseName: 'id',
            type: 'string',
        },
    ];

    public static getAttributeTypeMap() {
        return ConfigurationItem.attributeTypeMap;
    }
}
