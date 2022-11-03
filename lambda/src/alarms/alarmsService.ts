import { CloudWatchAlarmStateChange } from '../schema/aws/cloudwatch/cloudwatchalarmstatechange/CloudWatchAlarmStateChange';
import {
    CloudWatchClient,
    CompositeAlarm,
    DescribeAlarmHistoryCommand,
    DescribeAlarmsCommand,
    ListTagsForResourceCommand,
    MetricAlarm,
    SetAlarmStateCommand,
} from '@aws-sdk/client-cloudwatch';
import * as _ from 'lodash';
import { ConvertHistoryData, HistoryData } from './historyData';
import { ConvertPublishedMessage, PublishedMessage } from './publishedMessage';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { isSnsAction } from '../validation';

const cloudwatch = new CloudWatchClient({});
const sns = new SNSClient({});
const retriggerReason = 'RETRIGGER';

export const isRetriggeredAlarm = (detail: CloudWatchAlarmStateChange) => detail.state.reason === retriggerReason;

export const getAlarm = async (alarmName: string): Promise<MetricAlarm | CompositeAlarm> => {
    const alarmsOutput = await cloudwatch.send(
        new DescribeAlarmsCommand({
            AlarmNames: [alarmName],
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
        }),
    );

    if (alarmsOutput.MetricAlarms && alarmsOutput.MetricAlarms.length > 0) {
        return alarmsOutput.MetricAlarms[0];
    }

    if (alarmsOutput.CompositeAlarms && alarmsOutput.CompositeAlarms.length > 0) {
        return alarmsOutput.CompositeAlarms[0];
    }

    throw new Error(`Alarm not defined: ${JSON.stringify(alarmsOutput)}`);
};

export const isAlarmEnabled = async (alarmArn: string): Promise<boolean> => {
    const alarmTags = await cloudwatch.send(
        new ListTagsForResourceCommand({
            ResourceARN: alarmArn,
        }),
    );

    for (const tag of alarmTags.Tags || []) {
        if (tag.Key === 'AlarmRepeaterEnabled' && tag.Value === 'false') {
            return false;
        }
    }

    return true;
};

export const retriggerAlarms = async (alarmName: string, alarm: MetricAlarm | CompositeAlarm) => {
    try {
        if (!alarm.AlarmActions) {
            return;
        }
        const alarmActions = alarm.AlarmActions.filter(isSnsAction);
        if (_.isEmpty(alarmActions)) {
            return;
        }

        const lastAlarmsHistory = await getLastAlarmsHistory(alarmName);
        if (!alarmActions.every((action) => lastAlarmsHistory[action])) {
            console.warn('Triggered alarm never delivered all actions');
            await resetAlarms(alarmName);
            return;
        }

        for (const alarmAction of alarmActions) {
            await sns.send(
                new PublishCommand({
                    TopicArn: alarmAction,
                    Subject: `ALARM: ${alarmName} remains in ALARM state in ${process.env.AWS_REGION}`,
                    Message: lastAlarmsHistory[alarmAction].default,
                }),
            );
        }
    } catch (e) {
        console.error('Could not retrigger alarms', e);
        await resetAlarms(alarmName);
    }
};

const resetAlarms = async (alarmName: string) => {
    await cloudwatch.send(
        new SetAlarmStateCommand({
            AlarmName: alarmName,
            StateReason: retriggerReason,
            StateValue: 'OK',
        }),
    );
    await cloudwatch.send(
        new SetAlarmStateCommand({
            AlarmName: alarmName,
            StateReason: retriggerReason,
            StateValue: 'ALARM',
        }),
    );
};

const getLastAlarmsHistory = async (alarmName: string): Promise<Record<string, PublishedMessage>> => {
    const response = await cloudwatch.send(
        new DescribeAlarmHistoryCommand({
            AlarmName: alarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        }),
    );

    if (!response.AlarmHistoryItems || _.isEmpty(response.AlarmHistoryItems)) {
        return {};
    }

    return _.chain(response.AlarmHistoryItems)
        .map((x) => x.HistoryData)
        .flatMap((x) => (x ? [x] : []))
        .map(ConvertHistoryData.toHistoryData)
        .filter((x) => isSnsAction(x.notificationResource))
        .filter((x) => x.publishedMessage.includes('\\"NewStateValue\\":\\"ALARM\\"'))
        .reduce((acc, x) => {
            if (
                acc[x.notificationResource] &&
                acc[x.notificationResource].stateUpdateTimestamp > x.stateUpdateTimestamp
            ) {
                return acc;
            }

            acc[x.notificationResource] = x;
            return acc;
        }, <Record<string, HistoryData>>{})
        .mapValues((x) => ConvertPublishedMessage.toPublishedMessage(x.publishedMessage))
        .value();
};
