

export class Metric {
  'dimensions': any;
  'namespace': string;
  'name': string;

    private static discriminator: string | undefined = undefined;

    private static attributeTypeMap: Array<{name: string, baseName: string, type: string}> = [
        {
            "name": "dimensions",
            "baseName": "dimensions",
            "type": "any"
        },
        {
            "name": "namespace",
            "baseName": "namespace",
            "type": "string"
        },
        {
            "name": "name",
            "baseName": "name",
            "type": "string"
        }    ];

    public static getAttributeTypeMap() {
        return Metric.attributeTypeMap;
    }
}




