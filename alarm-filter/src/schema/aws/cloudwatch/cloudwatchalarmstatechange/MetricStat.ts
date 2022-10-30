
import { Metric } from './Metric';

export class MetricStat {
  'metric': Metric;
  'period': number;
  'stat': string;

    private static discriminator: string | undefined = undefined;

    private static attributeTypeMap: Array<{name: string, baseName: string, type: string}> = [
        {
            "name": "metric",
            "baseName": "metric",
            "type": "Metric"
        },
        {
            "name": "period",
            "baseName": "period",
            "type": "number"
        },
        {
            "name": "stat",
            "baseName": "stat",
            "type": "string"
        }    ];

    public static getAttributeTypeMap() {
        return MetricStat.attributeTypeMap;
    }
}




