-- AlterTable
ALTER TABLE "Utterance" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "minWordConfidence" DOUBLE PRECISION,
ADD COLUMN     "totalConfidence" DOUBLE PRECISION;
