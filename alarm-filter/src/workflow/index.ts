import {SFNClient, CreateActivityCommand, StartExecutionCommand} from "@aws-sdk/client-sfn";
import {AWSEvent} from "../schema/aws/cloudwatch/cloudwatchalarmstatechange/AWSEvent";
import {
    CloudWatchAlarmStateChange
} from "../schema/aws/cloudwatch/cloudwatchalarmstatechange/CloudWatchAlarmStateChange";

const stepFunctionsClient = new SFNClient({})

export const startAlarmChecker = async (event: AWSEvent<CloudWatchAlarmStateChange>) => {
    await stepFunctionsClient.send(new StartExecutionCommand({
        name: buildWorkflowName(event),
        input: JSON.stringify(event),
        stateMachineArn: process.env.STATE_MACHINE_ARN
    }))
}

function buildWorkflowName(event: AWSEvent<CloudWatchAlarmStateChange>) {
    return `${event.id}${event.detail.alarmName}`.replaceAll(/[^a-zA-Z0-9 ]/g, "").substring(0, 80);
}
