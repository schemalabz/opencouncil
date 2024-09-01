import { Party, Person } from '@prisma/client';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import { useState } from 'react';
import { Card, CardContent, CardFooter } from "../ui/card";
import FormSheet from '../FormSheet';
import PartyForm from './PartyForm';
import { useTranslations } from 'next-intl';

interface PartyCardProps {
    item: Party & { persons: Person[] };
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const [showAllMembers, setShowAllMembers] = useState(false);
    const t = useTranslations('PartyCard');
    const memberNames = party.persons.map(person => person.name);
    const displayedNames = showAllMembers ? memberNames : memberNames.slice(0, 3);
    const remainingCount = memberNames.length - displayedNames.length;

    return (
        <Card className="relative h-48 overflow-hidden transition-transform border-l-8" style={{ borderColor: party.colorHex, borderStyle: memberNames.length === 0 ? 'dashed' : 'solid', borderColor: memberNames.length === 0 ? 'muted-foreground' : party.colorHex }}>
            <CardContent className="relative h-full flex flex-col justify-center">
                <div className="flex items-center space-x-4">
                    <PartyLogo logoUrl={party.logo} colorHex={party.colorHex} width={48} height={48} />
                    <h3 className="text-2xl font-bold">{party.name}</h3>
                </div>
                <p className="mt-2">
                    {memberNames.length === 0 ? (
                        'No members'
                    ) : (
                        <>
                            {memberNames.length} members, including {displayedNames.join(', ')}
                            {remainingCount > 0 && (
                                <>
                                    , and <button onClick={() => setShowAllMembers(!showAllMembers)} className="text-blue-500 underline">
                                        {remainingCount} {showAllMembers ? 'less' : 'others'}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </p>
            </CardContent>
        </Card >
    );
}

interface PartyLogoProps {
    logoUrl: string | null;
    colorHex: string;
    width: number;
    height: number;
}

const PartyLogo: React.FC<PartyLogoProps> = ({ logoUrl, colorHex, width, height }) => {
    return (
        <div
            style={{
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: logoUrl ? 'transparent' : colorHex,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }}
        >
            {logoUrl ? (
                <Image
                    src={logoUrl}
                    alt="Party logo"
                    width={width}
                    height={height}
                    className="object-contain"
                />
            ) : (
                <div style={{ width: '100%', height: '100%' }} />
            )}
        </div>
    );
};
