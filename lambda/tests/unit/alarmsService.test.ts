import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
    CloudWatchClient,
    DescribeAlarmHistoryCommand,
    DescribeAlarmsCommand,
    ListTagsForResourceCommand,
    SetAlarmStateCommand,
} from '@aws-sdk/client-cloudwatch';
import { getAlarm, isAlarmEnabled, retriggerAlarms } from '../../src/alarms/alarmsService';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

describe('Alarms Service', () => {
    const cloudwatchClient = mockClient(CloudWatchClient);
    const snsClient = mockClient(SNSClient);

    beforeEach(() => {
        cloudwatchClient.reset();
        snsClient.reset();
    });

    it('should throw error on missing alarms', async () => {
        // GIVEN
        const alarmName = 'some-alarm-name';
        cloudwatchClient.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: [],
            CompositeAlarms: [],
        });

        // WHEN
        await expect(getAlarm(alarmName)).rejects.toThrowError();
    });

    it("should return metric alarm if it's defined", async () => {
        // GIVEN
        const alarmName = 'some-alarm-name';
        cloudwatchClient.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: [
                {
                    AlarmName: alarmName,
                },
            ],
            CompositeAlarms: [],
        });

        // WHEN
        const result = await getAlarm(alarmName);

        // THEN
        expect(result).toEqual({
            AlarmName: alarmName,
        });
    });

    it("should return composite alarm if it's defined", async () => {
        // GIVEN
        const alarmName = 'some-alarm-name';
        cloudwatchClient.on(DescribeAlarmsCommand).resolves({
            MetricAlarms: [],
            CompositeAlarms: [
                {
                    AlarmName: alarmName,
                },
            ],
        });

        // WHEN
        const result = await getAlarm(alarmName);

        // THEN
        expect(result).toEqual({
            AlarmName: alarmName,
        });
    });

    it('should mark alarm as disables if it has enabled:false tag', async () => {
        // GIVEN
        const alarmArn = 'some::arn';
        cloudwatchClient
            .on(ListTagsForResourceCommand, {
                ResourceARN: alarmArn,
            })
            .resolves({
                Tags: [
                    {
                        Key: 'someKey',
                        Value: 'someValue',
                    },
                    {
                        Key: 'AlarmRepeaterEnabled',
                        Value: 'false',
                    },
                ],
            });

        // WHEN
        const result = await isAlarmEnabled(alarmArn);

        // THEN
        expect(result).toEqual(false);
    });

    it('should mark alarm as enabled', async () => {
        // GIVEN
        const alarmArn = 'some::arn';
        cloudwatchClient
            .on(ListTagsForResourceCommand, {
                ResourceARN: alarmArn,
            })
            .resolves({
                Tags: [
                    {
                        Key: 'someKey',
                        Value: 'someValue',
                    },
                ],
            });

        // WHEN
        const result = await isAlarmEnabled(alarmArn);

        // THEN
        expect(result).toEqual(true);
    });

    it('should not retrigger alarms if there are no alarm actions', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: undefined,
        };

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(cloudwatchClient.calls()).toEqual([]);
        expect(snsClient.calls()).toEqual([]);
    });

    it('should use fallback for retriggering alarms if checking alarm history fails', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: ['arn:aws:sns:eu-west-1:123456:some-topic-name'],
        };
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .rejects('test failure');

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toEqual([]);
        expect(cloudwatchClient.calls()).toHaveLength(3);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(2, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'OK',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(3, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'ALARM',
        });
    });

    it('should use fallback for retriggering alarms if checking alarm history has no history of handling actions', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: ['arn:aws:sns:eu-west-1:123456:some-topic-name'],
        };
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .resolves({
                AlarmHistoryItems: [],
            });

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toEqual([]);
        expect(cloudwatchClient.calls()).toHaveLength(3);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(2, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'OK',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(3, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'ALARM',
        });
    });

    it('should use fallback for retriggering alarms if checking alarm history has not full history of handling actions', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: [
                'arn:aws:sns:eu-west-1:123456:some-topic-name',
                'arn:aws:sns:eu-west-1:123456:another-topic-name',
            ],
        };
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .resolves({
                AlarmHistoryItems: [
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData:
                            '{"actionState":"Succeeded","stateUpdateTimestamp":1667756633496,"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}',
                    },
                ],
            });

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toEqual([]);
        expect(cloudwatchClient.calls()).toHaveLength(3);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(2, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'OK',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(3, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'ALARM',
        });
    });

    it('should resend sns notifications successfully', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: [
                'arn:aws:sns:eu-west-1:123456:some-topic-name',
                'arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...',
            ],
        };
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .resolves({
                AlarmHistoryItems: [
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData:
                            '{"actionState":"Succeeded","stateUpdateTimestamp":1667756633496,"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}',
                    },
                ],
            });

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toHaveLength(1);
        expect(snsClient).toHaveReceivedNthCommandWith(1, PublishCommand, {
            TopicArn: 'arn:aws:sns:eu-west-1:123456:some-topic-name',
            Subject: 'ALARM: some-alarm remains in ALARM state in undefined',
            Message:
                '{"AlarmName":"some-alarm-name","AlarmDescription":"Test dummy alarm","AWSAccountId":"123456","NewStateValue":"ALARM","NewStateReason":"forced test reason","StateChangeTime":"2022-11-06T17:43:53.496+0000","Region":"EU (Ireland)","AlarmArn":"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name","OKActions":[],"AlarmActions":["arn:aws:sns:eu-west-1:123456:some-topic-name"],"InsufficientDataActions":[],"OldStateValue":"OK","AlarmRule":"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)","TriggeringChildren":[]}',
        });
        expect(cloudwatchClient.calls()).toHaveLength(1);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
    });

    it('should not send sns notification on OK actions only', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: [
                'arn:aws:sns:eu-west-1:123456:some-topic-name',
                'arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...',
            ],
        };
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .resolves({
                AlarmHistoryItems: [
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData:
                            '{"actionState":"Succeeded","stateUpdateTimestamp":1667756633496,"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}',
                    },
                ],
            });

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toHaveLength(0);
        expect(cloudwatchClient.calls()).toHaveLength(3);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(2, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'OK',
        });
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(3, SetAlarmStateCommand, {
            AlarmName: alarm.AlarmName,
            StateReason: 'RETRIGGER',
            StateValue: 'ALARM',
        });
    });

    it('should resend sns notifications successfully once per action', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: [
                'arn:aws:sns:eu-west-1:123456:some-topic-name',
                'arn:aws:sns:eu-west-1:123456:another-topic-name',
                'arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...',
            ],
        };
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .resolves({
                AlarmHistoryItems: [
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData:
                            '{"actionState":"Succeeded","stateUpdateTimestamp":1667756633496,"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}',
                    },
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:another-topic-name',
                        HistoryData:
                            '{"actionState":"Succeeded","stateUpdateTimestamp":1667756633496,"notificationResource":"arn:aws:sns:eu-west-1:123456:another-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:another-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:another-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}',
                    },
                ],
            });

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toHaveLength(2);
        expect(snsClient).toHaveReceivedNthCommandWith(1, PublishCommand, {
            TopicArn: 'arn:aws:sns:eu-west-1:123456:some-topic-name',
            Subject: 'ALARM: some-alarm remains in ALARM state in undefined',
            Message:
                '{"AlarmName":"some-alarm-name","AlarmDescription":"Test dummy alarm","AWSAccountId":"123456","NewStateValue":"ALARM","NewStateReason":"forced test reason","StateChangeTime":"2022-11-06T17:43:53.496+0000","Region":"EU (Ireland)","AlarmArn":"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name","OKActions":[],"AlarmActions":["arn:aws:sns:eu-west-1:123456:some-topic-name"],"InsufficientDataActions":[],"OldStateValue":"OK","AlarmRule":"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)","TriggeringChildren":[]}',
        });
        expect(snsClient).toHaveReceivedNthCommandWith(2, PublishCommand, {
            TopicArn: 'arn:aws:sns:eu-west-1:123456:another-topic-name',
            Subject: 'ALARM: some-alarm remains in ALARM state in undefined',
            Message:
                '{"AlarmName":"some-alarm-name","AlarmDescription":"Test dummy alarm","AWSAccountId":"123456","NewStateValue":"ALARM","NewStateReason":"forced test reason","StateChangeTime":"2022-11-06T17:43:53.496+0000","Region":"EU (Ireland)","AlarmArn":"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name","OKActions":[],"AlarmActions":["arn:aws:sns:eu-west-1:123456:another-topic-name"],"InsufficientDataActions":[],"OldStateValue":"OK","AlarmRule":"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)","TriggeringChildren":[]}',
        });
        expect(cloudwatchClient.calls()).toHaveLength(1);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
    });

    it('should resend only last sns notification', async () => {
        // GIVEN
        const alarm = {
            AlarmName: 'some-alarm',
            AlarmActions: [
                'arn:aws:sns:eu-west-1:123456:some-topic-name',
                'arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...',
            ],
        };
        const baseTimestamp = 1667756633496;
        cloudwatchClient
            .on(DescribeAlarmHistoryCommand, {
                AlarmName: alarm.AlarmName,
                AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
                HistoryItemType: 'Action',
            })
            .resolves({
                AlarmHistoryItems: [
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData: `{"actionState":"Succeeded","stateUpdateTimestamp":${baseTimestamp},"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}`,
                    },
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData: `{"actionState":"Succeeded","stateUpdateTimestamp":${
                            baseTimestamp + 1000
                        },"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm sent later\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}`,
                    },
                    {
                        AlarmName: 'some-alarm',
                        AlarmType: 'CompositeAlarm',
                        HistoryItemType: 'Action',
                        HistorySummary: 'Successfully executed action arn:aws:sns:eu-west-1:123456:some-topic-name',
                        HistoryData: `{"actionState":"Succeeded","stateUpdateTimestamp":${
                            baseTimestamp - 1000
                        },"notificationResource":"arn:aws:sns:eu-west-1:123456:some-topic-name","publishedMessage":"{\\"default\\":\\"{\\\\\\"AlarmName\\\\\\":\\\\\\"some-alarm-name\\\\\\",\\\\\\"AlarmDescription\\\\\\":\\\\\\"Test dummy alarm sent ealier\\\\\\",\\\\\\"AWSAccountId\\\\\\":\\\\\\"123456\\\\\\",\\\\\\"NewStateValue\\\\\\":\\\\\\"ALARM\\\\\\",\\\\\\"NewStateReason\\\\\\":\\\\\\"forced test reason\\\\\\",\\\\\\"StateChangeTime\\\\\\":\\\\\\"2022-11-06T17:43:53.496+0000\\\\\\",\\\\\\"Region\\\\\\":\\\\\\"EU (Ireland)\\\\\\",\\\\\\"AlarmArn\\\\\\":\\\\\\"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\\\",\\\\\\"OKActions\\\\\\":[],\\\\\\"AlarmActions\\\\\\":[\\\\\\"arn:aws:sns:eu-west-1:123456:some-topic-name\\\\\\"],\\\\\\"InsufficientDataActions\\\\\\":[],\\\\\\"OldStateValue\\\\\\":\\\\\\"OK\\\\\\",\\\\\\"AlarmRule\\\\\\":\\\\\\"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\\\",\\\\\\"TriggeringChildren\\\\\\":[]}\\",\\"sms\\":\\"ALARM: \\\\\\"some-alarm-name\\\\\\" in EU (Ireland)\\",\\"email\\":\\"You are receiving this email because your Amazon CloudWatch Alarm \\\\\\"some-alarm-name\\\\\\" in the EU (Ireland) region has transitioned to ALARM state on Sunday 06 November, 2022 17:43:53 UTC, because \\\\\\"forced test reason\\\\\\".\\\\n\\\\nView this alarm in the AWS Management Console:\\\\nhttps://eu-west-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=eu-west-1#alarmsV2:alarm/Dummy%20composite%20alarm\\\\n\\\\nAlarm Details:\\\\n- Name:                       some-alarm-name\\\\n- Description:                Test dummy alarm\\\\n- State Change:               OK -> ALARM\\\\n- Alarm Rule:                 ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)\\\\n- Reason for State Change:    forced test reason\\\\n- Timestamp:                  Sunday 06 November, 2022 17:43:53 UTC\\\\n- AWS Account:                123456\\\\n- Alarm Arn:                  arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name\\\\n\\\\nTriggering children (max. 10):\\\\n\\\\nState Change Actions:\\\\n- OK: \\\\n- ALARM: [arn:aws:sns:eu-west-1:123456:some-topic-name]\\\\n- INSUFFICIENT_DATA: \\\\n\\"}","error":null}`,
                    },
                ],
            });

        // WHEN
        await retriggerAlarms(alarm.AlarmName, alarm);

        // THEN
        expect(snsClient.calls()).toHaveLength(1);
        expect(snsClient).toHaveReceivedNthCommandWith(1, PublishCommand, {
            TopicArn: 'arn:aws:sns:eu-west-1:123456:some-topic-name',
            Subject: 'ALARM: some-alarm remains in ALARM state in undefined',
            Message:
                '{"AlarmName":"some-alarm-name","AlarmDescription":"Test dummy alarm sent later","AWSAccountId":"123456","NewStateValue":"ALARM","NewStateReason":"forced test reason","StateChangeTime":"2022-11-06T17:43:53.496+0000","Region":"EU (Ireland)","AlarmArn":"arn:aws:cloudwatch:eu-west-1:123456:alarm:some-alarm-name","OKActions":[],"AlarmActions":["arn:aws:sns:eu-west-1:123456:some-topic-name"],"InsufficientDataActions":[],"OldStateValue":"OK","AlarmRule":"ALARM(dummy-function-DummyErrorAlarm-1LWOKJ2U4UZ2U) OR ALARM(dummy-function-DummyErrorPercentageAlarm-PM5CG7X05G4P)","TriggeringChildren":[]}',
        });
        expect(cloudwatchClient.calls()).toHaveLength(1);
        expect(cloudwatchClient).toHaveReceivedNthCommandWith(1, DescribeAlarmHistoryCommand, {
            AlarmName: alarm.AlarmName,
            AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
            HistoryItemType: 'Action',
        });
    });
});
