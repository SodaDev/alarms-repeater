import {MetricAlarm} from "@aws-sdk/client-cloudwatch";

export function isAutoscalingAlarm(alarm: MetricAlarm): boolean {
    const actions = alarm.OKActions?.concat(alarm.AlarmActions || [])
    for (let okAction in actions) {
        if (okAction && !okAction.includes("autoscaling")) {
            return false
        }
    }

    return true
}