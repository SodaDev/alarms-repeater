import {
    CloudWatchAlarmStateChange
} from './src/schema/aws/cloudwatch/cloudwatchalarmstatechange/CloudWatchAlarmStateChange';
import {AWSEvent} from "./src/schema/aws/cloudwatch/cloudwatchalarmstatechange/AWSEvent";
import {getAlarm, isAlarmDisabled, isRetriggeredAlarm} from "./src/alarms/alarmsService";
import {MetricAlarm} from "@aws-sdk/client-cloudwatch";
import {isAutoscalingAlarm} from "./src/validation";
import {startAlarmChecker} from "./src/workflow";

export const checkerHandler = async (event: AWSEvent<CloudWatchAlarmStateChange>): Promise<AWSEvent<CloudWatchAlarmStateChange>> => {
    console.log("Received", JSON.stringify(event))

    return Promise.resolve(event)
}

export const filterHandler = async (event: AWSEvent<CloudWatchAlarmStateChange>): Promise<AWSEvent<CloudWatchAlarmStateChange>> => {
    console.log("Received", JSON.stringify(event))

    if (isRetriggeredAlarm(event.detail)) {
        console.debug("Retriggered alarm", event)
        return Promise.resolve(event)
    }

    const alarm = await getAlarm(event.detail.alarmName);
    if (!await isAlarmOfInterest(alarm)) {
        console.debug("skipping alarm", event)
        return Promise.resolve(event)
    }

    await startAlarmChecker(event)

    return event;
};

async function isAlarmOfInterest(alarm: MetricAlarm) {
    if (isAutoscalingAlarm(alarm)) {
        console.debug("Autoscaling alarm triggered", alarm)
        return false
    }
    if (alarm.AlarmArn && await isAlarmDisabled(alarm.AlarmArn)) {
        console.debug("Autoscaling alarm triggered", alarm)
        return false
    }

    return true;
}


