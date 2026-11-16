import { documentWording } from './wording';

describe('documentWording', () => {
    it('uses the wording of a study when the document has no type', () => {
        const wording = documentWording(undefined);
        expect(wording).toBe(documentWording('study'));
        expect(wording.chapterLabel(4)).toBe('Κεφάλαιο 4');
        expect(wording.articleLabel(4, 2)).toBe('Άρθρο 2');
        expect(wording.chapterCount(1)).toBe('1 κεφάλαιο');
        expect(wording.articleCount(3)).toBe('3 άρθρα');
        expect(wording.commentOnChapter(4)).toBe('Σχολιάστε όλο το κεφάλαιο 4');
        expect(wording.commentOnArticle(4, 2)).toBe('Σχολιάστε το άρθρο 2');
        expect(wording.commentOnArticleReference(4, 2)).toBe('Σχολιάστε την ενότητα 4.2');
    });

    it('calls the items of a regulation articles and paragraphs', () => {
        const wording = documentWording('regulation');
        expect(wording.chapterLabel(4)).toBe('Άρθρο 4');
        expect(wording.articleLabel(4, 2)).toBe('Παράγραφος 4.2');
        expect(wording.chapterCount(9)).toBe('9 άρθρα');
        expect(wording.articleCount(1)).toBe('1 παράγραφος');
        expect(wording.articleCount(10)).toBe('10 παράγραφοι');
        expect(wording.commentOnChapter(4)).toBe('Σχολιάστε όλο το άρθρο 4');
        expect(wording.commentOnChapterAlone(3)).toBe('Σχολιάστε το άρθρο 3');
        expect(wording.commentOnArticle(4, 2)).toBe('Σχολιάστε την παράγραφο 4.2');
        expect(wording.commentOnArticleReference(4, 2)).toBe('Σχολιάστε την παράγραφο 4.2');
    });
});
