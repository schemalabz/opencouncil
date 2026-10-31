-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CityLanguage" ADD VALUE 'bs';
ALTER TYPE "CityLanguage" ADD VALUE 'en';
ALTER TYPE "CityLanguage" ADD VALUE 'cy';
ALTER TYPE "CityLanguage" ADD VALUE 'ga';
ALTER TYPE "CityLanguage" ADD VALUE 'da';
ALTER TYPE "CityLanguage" ADD VALUE 'no';
ALTER TYPE "CityLanguage" ADD VALUE 'is';
ALTER TYPE "CityLanguage" ADD VALUE 'et';
ALTER TYPE "CityLanguage" ADD VALUE 'lv';
ALTER TYPE "CityLanguage" ADD VALUE 'lt';
ALTER TYPE "CityLanguage" ADD VALUE 'cs';
ALTER TYPE "CityLanguage" ADD VALUE 'sk';
ALTER TYPE "CityLanguage" ADD VALUE 'hu';
ALTER TYPE "CityLanguage" ADD VALUE 'sl';
ALTER TYPE "CityLanguage" ADD VALUE 'hr';
ALTER TYPE "CityLanguage" ADD VALUE 'ro';
ALTER TYPE "CityLanguage" ADD VALUE 'bg';
ALTER TYPE "CityLanguage" ADD VALUE 'mk';
ALTER TYPE "CityLanguage" ADD VALUE 'mt';
ALTER TYPE "CityLanguage" ADD VALUE 'lb';
ALTER TYPE "CityLanguage" ADD VALUE 'uk';
ALTER TYPE "CityLanguage" ADD VALUE 'ru';
ALTER TYPE "CityLanguage" ADD VALUE 'tr';
ALTER TYPE "CityLanguage" ADD VALUE 'sq';
ALTER TYPE "CityLanguage" ADD VALUE 'eu';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Realm" ADD VALUE 'bosnia';
ALTER TYPE "Realm" ADD VALUE 'andorra';
ALTER TYPE "Realm" ADD VALUE 'albania';
ALTER TYPE "Realm" ADD VALUE 'bulgaria';
ALTER TYPE "Realm" ADD VALUE 'switzerland';
ALTER TYPE "Realm" ADD VALUE 'czechia';
ALTER TYPE "Realm" ADD VALUE 'denmark';
ALTER TYPE "Realm" ADD VALUE 'estonia';
ALTER TYPE "Realm" ADD VALUE 'united_kingdom';
ALTER TYPE "Realm" ADD VALUE 'croatia';
ALTER TYPE "Realm" ADD VALUE 'hungary';
ALTER TYPE "Realm" ADD VALUE 'ireland';
ALTER TYPE "Realm" ADD VALUE 'iceland';
ALTER TYPE "Realm" ADD VALUE 'liechtenstein';
ALTER TYPE "Realm" ADD VALUE 'lithuania';
ALTER TYPE "Realm" ADD VALUE 'luxembourg';
ALTER TYPE "Realm" ADD VALUE 'latvia';
ALTER TYPE "Realm" ADD VALUE 'monaco';
ALTER TYPE "Realm" ADD VALUE 'moldova';
ALTER TYPE "Realm" ADD VALUE 'montenegro';
ALTER TYPE "Realm" ADD VALUE 'north_macedonia';
ALTER TYPE "Realm" ADD VALUE 'malta';
ALTER TYPE "Realm" ADD VALUE 'norway';
ALTER TYPE "Realm" ADD VALUE 'romania';
ALTER TYPE "Realm" ADD VALUE 'sweden';
ALTER TYPE "Realm" ADD VALUE 'slovenia';
ALTER TYPE "Realm" ADD VALUE 'slovakia';
ALTER TYPE "Realm" ADD VALUE 'san_marino';
ALTER TYPE "Realm" ADD VALUE 'ukraine';
ALTER TYPE "Realm" ADD VALUE 'kosovo';
