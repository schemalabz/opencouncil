import { TASK_CONFIG, taskScope } from '../types';

describe('taskScope', () => {
    const meetingTypes = Object.entries(TASK_CONFIG).filter(([, config]) => config.scope === 'meeting').map(([type]) => type);
    const cityTypes = Object.entries(TASK_CONFIG).filter(([, config]) => config.scope === 'city').map(([type]) => type);

    it('gives the meeting scope to the tasks that a body admin runs, and no other', () => {
        expect(meetingTypes.sort()).toEqual(['fixTranscript', 'generateHighlight', 'processAgenda', 'summarize', 'transcribe']);
        expect(cityTypes.sort()).toEqual(['generateVoiceprint', 'humanReview', 'pollDecisions', 'transcriptSent']);
    });

    it.each(meetingTypes)('scopes a %s task to its meeting', (type) => {
        expect(taskScope({ type, cityId: 'c', councilMeetingId: 'm' })).toEqual({ cityId: 'c', councilMeetingId: 'm' });
    });

    it.each(cityTypes)('scopes a %s task to its city', (type) => {
        expect(taskScope({ type, cityId: 'c', councilMeetingId: 'm' })).toEqual({ cityId: 'c' });
    });

    it('scopes a task without a meeting, or of an unknown type, to its city', () => {
        expect(taskScope({ type: 'transcribe', cityId: 'c', councilMeetingId: null })).toEqual({ cityId: 'c' });
        expect(taskScope({ type: 'unknown', cityId: 'c', councilMeetingId: 'm' })).toEqual({ cityId: 'c' });
    });
});
