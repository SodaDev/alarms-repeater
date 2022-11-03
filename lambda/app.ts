import { CloudWatchAlarmStateChange } from './src/schema/aws/cloudwatch/cloudwatchalarmstatechange/CloudWatchAlarmStateChange';
import { AWSEvent } from './src/schema/aws/cloudwatch/cloudwatchalarmstatechange/AWSEvent';
import { getAlarm, isAlarmEnabled, isRetriggeredAlarm, retriggerAlarms } from './src/alarms/alarmsService';
import { CompositeAlarm, MetricAlarm } from '@aws-sdk/client-cloudwatch';
import { hasAnySnsAction, hasAutoscalingActions } from './src/validation';
import { startAlarmChecker } from './src/workflow';

interface AlarmEventWithStatus extends AWSEvent<CloudWatchAlarmStateChange> {
    currentState?: string;
}

export const checkerHandler = async (event: AWSEvent<CloudWatchAlarmStateChange>): Promise<AlarmEventWithStatus> => {
    console.log('Received', JSON.stringify(event));

    const alarm = await getAlarm(event.detail.alarmName);
    if ((alarm.AlarmName && alarm.StateValue) || alarm.StateValue === 'ALARM') {
        await retriggerAlarms(event.detail.alarmName, alarm);
    }

    return Promise.resolve({
        ...event,
        currentState: alarm.StateValue,
    });
};

export const filterHandler = async (
    event: AWSEvent<CloudWatchAlarmStateChange>,
): Promise<AWSEvent<CloudWatchAlarmStateChange>> => {
    console.log('Received', JSON.stringify(event));

    if (isRetriggeredAlarm(event.detail)) {
        console.debug('skipping retriggered alarm', event);
        return Promise.resolve(event);
    }

    const alarm = await getAlarm(event.detail.alarmName);
    if (!(await isAlarmOfInterest(alarm))) {
        console.debug('skipping alarm', event);
        return Promise.resolve(event);
    }

    await startAlarmChecker(event);

    return event;
};

async function isAlarmOfInterest(alarm: MetricAlarm | CompositeAlarm) {
    if (hasAutoscalingActions(alarm)) {
        console.debug('Autoscaling alarm triggered', alarm);
        return false;
    }
    if (alarm.AlarmArn && (await !isAlarmEnabled(alarm.AlarmArn))) {
        console.debug('Disabled alarm triggered', alarm);
        return false;
    }

    return hasAnySnsAction(alarm);
}
