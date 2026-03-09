'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UtensilsCrossed } from 'lucide-react';

const CARBONARA_RECIPE = {
  title: 'Αυθεντική Καρμπονάρα',
  servings: '4 μερίδες',
  time: '25 λεπτά',
  ingredients: [
    '400g σπαγγέτι ή ριγκατόνι',
    '200g γκουαντσιάλε (ή παντσέτα), σε λωρίδες',
    '4 κρόκοι αυγών + 2 ολόκληρα αυγά',
    '100g πεκορίνο ρομάνο, τριμμένο',
    '50g παρμεζάνα, τριμμένη',
    'Φρεσκοτριμμένο μαύρο πιπέρι',
  ],
  steps: [
    'Βράστε τα ζυμαρικά σε αλατισμένο νερό μέχρι να γίνουν al dente. Κρατήστε 1 κούπα από το νερό βρασμού πριν στραγγίξετε.',
    'Τσιγαρίστε το γκουαντσιάλε σε κρύο τηγάνι σε μέτρια φωτιά για 8-10 λεπτά μέχρι να γίνει τραγανό. Αφαιρέστε από τη φωτιά.',
    'Χτυπήστε τους κρόκους, τα αυγά, το πεκορίνο, την παρμεζάνα και άφθονο πιπέρι σε ένα μπολ μέχρι να γίνει λείο μείγμα.',
    'Προσθέστε τα ζεστά, στραγγισμένα ζυμαρικά στο τηγάνι με το γκουαντσιάλε (εκτός φωτιάς). Ανακατέψτε καλά.',
    'Ρίξτε το μείγμα αυγών πάνω στα ζυμαρικά και ανακατέψτε γρήγορα. Η υπολειπόμενη ζέστη θα μαγειρέψει απαλά τα αυγά σε κρεμώδη σάλτσα. Προσθέστε λίγο νερό βρασμού για μεταξένια υφή.',
    'Σερβίρετε αμέσως με επιπλέον πεκορίνο και πιπέρι.',
  ],
  tip: 'Το κλειδί της καρμπονάρας είναι ο έλεγχος θερμοκρασίας — το τηγάνι πρέπει να είναι εκτός φωτιάς όταν προσθέτετε το μείγμα αυγών, αλλιώς θα καταλήξετε με ομελέτα αντί για κρεμώδη σάλτσα.',
};

export function CarbonaraButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UtensilsCrossed className="h-4 w-4" />
          Συνταγή Καρμπονάρα
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UtensilsCrossed className="h-5 w-5" />
            {CARBONARA_RECIPE.title}
          </DialogTitle>
          <DialogDescription>
            {CARBONARA_RECIPE.servings} · {CARBONARA_RECIPE.time}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
              Υλικά
            </h3>
            <ul className="space-y-1.5">
              {CARBONARA_RECIPE.ingredients.map((ingredient) => (
                <li key={ingredient} className="text-sm flex items-start gap-2">
                  <span className="text-[hsl(var(--orange))] mt-1">•</span>
                  {ingredient}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
              Οδηγίες
            </h3>
            <ol className="space-y-3">
              {CARBONARA_RECIPE.steps.map((step, stepIndex) => (
                <li key={step} className="text-sm flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))] flex items-center justify-center text-xs font-bold">
                    {stepIndex + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 border border-border">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">Συμβουλή:</span>{' '}
              {CARBONARA_RECIPE.tip}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
