import { listPrismaModels, listPrismaModelsFromFile } from './prisma-models';

describe('listPrismaModels', () => {
    test('returns model names in file order and ignores enums, views, and comments', () => {
        const schema = `
// model NotAModel {
enum CityStatus {
  pending
}
model City {
  id String @id
}
view Something {
  id String
}
model   CouncilMeeting{
  id String @id
}
`;
        expect(listPrismaModels(schema)).toEqual(['City', 'CouncilMeeting']);
    });

    test('reads the real main schema and finds the core models', () => {
        const models = listPrismaModelsFromFile('prisma/schema.prisma');
        expect(models).toEqual(expect.arrayContaining(['City', 'CouncilMeeting', 'User', 'TaskStatus']));
        expect(new Set(models).size).toBe(models.length);
    });
});
