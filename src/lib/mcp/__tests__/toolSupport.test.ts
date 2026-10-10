/** @jest-environment node */
import { run } from '../toolSupport';
import { LifecycleRuleError } from '../../meetingLifecycleRules';

describe('run', () => {
    it('shows the message of a broken lifecycle rule, so the assistant can tell the user', async () => {
        const result = await run(async () => {
            throw new LifecycleRuleError('laterMeetingReleased', 'A later meeting of this postponement is public. Unrelease it first.');
        });
        expect(result).toEqual({
            isError: true,
            content: [{ type: 'text', text: 'A later meeting of this postponement is public. Unrelease it first. (rule: laterMeetingReleased)' }],
        });
    });
});
