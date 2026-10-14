import { generateMeetingFileName } from '../download';

describe('generateMeetingFileName', () => {
    it('names the file after the city and the meeting', () => {
        expect(generateMeetingFileName('athens', 'jun18_3_2026', 'docx')).toBe('athens_council_meeting_jun18_3_2026.docx');
    });

    it('keeps only the characters a Content-Disposition header can carry', () => {
        // A Greek letter would make the Response constructor throw; a quote would end the header's filename early.
        expect(generateMeetingFileName('athens', 'συνεδρίαση_1"(β)', 'docx')).toBe('athens_council_meeting__1.docx');
    });
});
