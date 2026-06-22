import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { OnboardingStage } from '@/lib/types/onboarding';
import { Home, Mail, Bell } from 'lucide-react';
import { OnboardingStepTemplate } from './OnboardingStepTemplate';
import { findOsektutuNeighbourhood } from '@/lib/osektutu';
import { OsektutuBanner } from './OsektutuBanner';

export function CompleteStep() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { stage, city, selectedLocations } = useOnboarding();

  const isPetitionFlow = stage === OnboardingStage.PETITION_COMPLETE;

  // Surface the osektutu promo when one of the selected locations falls inside an
  // active osektutu neighbourhood (notification flow only). See issue #416.
  const osektutuNeighbourhood = isPetitionFlow
    ? null
    : findOsektutuNeighbourhood(selectedLocations);

  const handleHomeClick = () => {
    router.push('/');
  };

  const getTitle = () => {
    if (isPetitionFlow) {
      return 'Το αίτημά σας καταχωρήθηκε';
    }
    return sessionStatus === 'authenticated' 
      ? 'Οι επιλογές σας ενημερώθηκαν'
      : 'Η εγγραφή σας ολοκληρώθηκε';
  };

  const getDescription = () => {
    if (isPetitionFlow) {
      return `Σας ευχαριστούμε για την υποστήριξή σας! Θα σας ενημερώσουμε όταν ο ${city?.name_municipality} ενταχθεί στο δίκτυο OpenCouncil.`;
    }
    return sessionStatus === 'authenticated'
      ? undefined
      : 'Έχουμε στείλει ένα email για την επιβεβαίωση του λογαριασμού σας.';
  };

  const footer = (
    <div className="p-4">
      <Button
        variant="default"
        className="w-full"
        onClick={handleHomeClick}
      >
        <Home className="h-4 w-4 mr-2" />
        Επιστροφή στην αρχική
      </Button>
    </div>
  );

  return (
    <OnboardingStepTemplate
      title={getTitle()}
      description={getDescription()}
      footer={footer}
    >
      <div className="text-center">
        {!isPetitionFlow && (
          <div className="bg-gray-50 rounded-lg p-4 mb-3 text-left">
            <h3 className="font-medium mb-2">Τι ακολουθεί;</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <Bell className="h-5 w-5 mt-0.5 shrink-0 text-gray-400" />
                <span>Θα λαμβάνετε ειδοποιήσεις για τις τοποθεσίες και τα θέματα που επιλέξατε — πριν ή αφού συζητηθούν στο δημοτικό συμβούλιο.</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="h-5 w-5 mt-0.5 shrink-0 text-gray-400" />
                <span>
                  Μπορείτε να διαχειριστείτε τις ειδοποιήσεις σας για τον δήμο από τη{' '}
                  {sessionStatus === 'authenticated' ? (
                    <Link
                      href="/profile?tab=notifications"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      σελίδα ειδοποιήσεων
                    </Link>
                  ) : (
                    'σελίδα ειδοποιήσεων'
                  )}
                </span>
              </li>
            </ul>
          </div>
        )}
        {osektutuNeighbourhood && city && (
          <OsektutuBanner neighbourhood={osektutuNeighbourhood} cityId={city.id} />
        )}
      </div>
    </OnboardingStepTemplate>
  );
} 