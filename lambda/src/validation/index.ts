import { CompositeAlarm, MetricAlarm } from '@aws-sdk/client-cloudwatch';

const getActions = (alarm: MetricAlarm | CompositeAlarm) => (alarm.OKActions || []).concat(alarm.AlarmActions || []);

const hasAction = (alarm: MetricAlarm | CompositeAlarm, predicate: (resource: string) => boolean) =>
    getActions(alarm).some(predicate);

export const hasAutoscalingActions = (alarm: MetricAlarm | CompositeAlarm): boolean =>
    hasAction(alarm, isAutoscalingAction);

export const hasAnySnsAction = (alarm: MetricAlarm | CompositeAlarm): boolean => hasAction(alarm, isSnsAction);

export const isSnsAction = (resource: string) => resource.startsWith('arn:aws:sns');

const isAutoscalingAction = (resource: string) => resource.includes('autoscaling');
