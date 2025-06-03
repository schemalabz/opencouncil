import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { OnboardingStage } from '@/lib/types/onboarding';
import { Home, Mail, Bell } from 'lucide-react';
import { OnboardingStepTemplate } from './OnboardingStepTemplate';

export function CompleteStep() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { stage, city, setStage } = useOnboarding();

  const isPetitionFlow = stage === OnboardingStage.PETITION_COMPLETE;

  const handleHomeClick = () => {
    router.push('/');
  };

  const handleManageNotifications = () => {
    setStage(OnboardingStage.NOTIFICATION_INFO);
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
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-medium mb-2">Τι ακολουθεί;</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <Bell className="h-4 w-4 mt-0.5 text-gray-400" />
                <span>Θα λαμβάνετε ειδοποιήσεις για τις τοποθεσίες και τα θέματα που επιλέξατε — πριν ή αφού συζητηθούν στο δημοτικό συμβούλιο.</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-gray-400" />
                <span>
                  Μπορείτε να διαχειριστείτε τις ειδοποιήσεις σας για τον δήμο από τη{' '}
                  <button 
                    onClick={handleManageNotifications}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    σελίδα ειδοποιήσεων
                  </button>
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </OnboardingStepTemplate>
  );
} 