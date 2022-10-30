import {
    CloudWatchAlarmStateChange
} from "../schema/aws/cloudwatch/cloudwatchalarmstatechange/CloudWatchAlarmStateChange";
import {CloudWatchClient, DescribeAlarmsCommand, ListTagsForResourceCommand, Tag} from "@aws-sdk/client-cloudwatch";

const cloudwatch = new CloudWatchClient({})

// TODO(sodkiewiczm): Get from history
export const isRetriggeredAlarm = (detail: CloudWatchAlarmStateChange) =>
    detail.state.reason === "RETRIGGER"

export const getAlarm = async (alarmName: string) => {
    const alarmsOutput = await cloudwatch.send(new DescribeAlarmsCommand({
        AlarmNames: [alarmName]
    }));

    // TODO(sodkiewiczm): Check composite alarms
    if (!alarmsOutput.MetricAlarms || alarmsOutput.MetricAlarms.length > 1) {
        throw new Error(`Alarm not defined: ${alarmsOutput}`)
    }

    return alarmsOutput.MetricAlarms[0]
}

export const isAlarmDisabled = async (alarmArn: string): Promise<boolean> => {
    const alarmTags = await cloudwatch.send(new ListTagsForResourceCommand({
        ResourceARN: alarmArn
    }))

    for (let tag of (alarmTags.Tags || [])) {
        if (tag.Key === "Enabled" && tag.Value === "false") {
            return false
        }
    }

    return true
}