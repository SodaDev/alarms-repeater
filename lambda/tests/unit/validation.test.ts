import { hasAnySnsAction, hasAutoscalingActions } from '../../src/validation';

describe('Alarm validator', () => {
    it('should detect autoscaling action', () => {
        // GIVEN
        const alarm = {
            OKActions: ['arn:aws:sns:some-region-1:123456:DummyAlarmName'],
            AlarmActions: ['arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...'],
        };

        // WHEN
        const result = hasAutoscalingActions(alarm);

        // THEN
        expect(result).toBe(true);
    });

    it('should not detect autoscaling action', () => {
        // GIVEN
        const alarm = {
            OKActions: ['arn:aws:sns:some-region-1:123456:DummyAlarmName'],
            AlarmActions: ['arn:aws:sns:some-region-1:123456:AnotherTopic'],
        };

        // WHEN
        const result = hasAutoscalingActions(alarm);

        // THEN
        expect(result).toBe(false);
    });

    it('should detect sns action', () => {
        // GIVEN
        const alarm = {
            OKActions: ['arn:aws:sns:some-region-1:123456:DummyAlarmName'],
            AlarmActions: ['arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...'],
        };

        // WHEN
        const result = hasAnySnsAction(alarm);

        // THEN
        expect(result).toBe(true);
    });

    it('should not detect sns action', () => {
        // GIVEN
        const alarm = {
            OKActions: ['arn:aws:autoscaling:some-region-1:123456:scalingPolicy:...'],
            AlarmActions: ['arn:aws:autoscaling:some-region-1:123456:anotherScalingPolicy:...'],
        };

        // WHEN
        const result = hasAnySnsAction(alarm);

        // THEN
        expect(result).toBe(false);
    });
});
