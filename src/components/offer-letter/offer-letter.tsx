"use client"
import { formatCurrency } from "@/lib/utils";
import { calculateOfferTotals, PHYSICAL_PRESENCE } from "@/lib/pricing";
import { Offer } from "@prisma/client";
import { Button } from "../ui/button";
import { monthsBetween, formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Building2, FileText, Smartphone, Mic, MessageCircle, Code, Mail, Phone, Copy, Check, Link, Database, CheckSquare, Badge, Eraser, Rocket, Package, Clock } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export default function OfferLetter({ offer }: { offer: Offer }) {
    const { months, platformTotal, ingestionTotal, equipmentRentalTotal, physicalPresenceTotal, subtotal, discount, total, hoursToGuarantee, correctnessGuaranteeCost, paymentPlan } = calculateOfferTotals(offer)
    const isRegion = offer.recipientName.startsWith("Περιφέρεια"); // awful, fix this

    const CTABox = () => (
        <Card className="my-8 bg-blue-50 print:break-inside-avoid print:my-6 print:bg-blue-50">
            <CardContent className="p-6">
                <p className="text-center">
                    Για να απαντήσετε σε αυτή τη προσφορά, στείλτε μoυ ένα email στο <a href={`mailto:${offer.respondToEmail}`}>{offer.respondToEmail}</a>.
                    Για ερωτήσεις, μπορείτε να με καλέσετε στο <a href={`tel:${offer.respondToPhone}`}>{offer.respondToPhone}</a>.
                </p>
            </CardContent>
        </Card>
    )
    return (
        <div className="max-w-7xl mx-auto sm:p-8 print:p-0 print:py-8 print:px-12 space-y-8 print:space-y-6 print:text-sm">
            <OfferLetterNotice offer={offer} />
            <header className="text-center space-y-4 print:break-after-avoid">
                <div className="flex items-center justify-center gap-4">
                    <Image
                        src="/logo.png"
                        alt="OpenCouncil Logo"
                        width={64}
                        height={64}
                    />
                    <h1 className="text-4xl font-bold text-primary">OpenCouncil</h1>
                </div>
                <h2 className="text-2xl font-semibold">
                    {/* awful, fix this */}
                    Οικονομική Προσφορά για {isRegion ? "την" : "το"} {offer.recipientName}
                </h2>
                <p className="font-bold">
                    για τη πλατφόρμα OpenCouncil, τη ψηφιοποίηση δημόσιων συνεδριάσεων και τη δυνατότητα συμμετοχής σε πιλοτικές λειτουργίες
                </p>
                <p className="text-sm text-gray-600">
                    {formatDate(offer.createdAt)}
                </p>
            </header>

            <section className="mb-8 print:break-inside-avoid">
                <h3 className="text-2xl font-semibold mb-4">Περίοδος παροχής υπηρεσιών</h3>
                <p>Από <span className="font-bold">{formatDate(offer.startDate)}</span> έως <span className="font-bold">{formatDate(offer.endDate)}</span> (τιμολογείται ως <span className="font-bold">{months} μήνες</span>).</p>
                <p>Δωρεάν δοκιμαστική περίοδος μέχρι τότε.</p>
            </section>

            <section className="mb-8 print:break-inside-avoid-page bg-white">
                <h3 className="text-2xl font-semibold mb-4">Κόστος</h3>
                <div className="overflow-x-auto bg-white">
                    <table className="w-full min-w-[500px] print:text-xs print:w-full bg-white">
                        <thead>
                            <tr className="border-b bg-white">
                                <th className="text-left py-2">Υπηρεσία</th>
                                <th className="text-right py-2">Μονάδα</th>
                                <th className="text-right py-2">Τιμή</th>
                                <th className="text-right py-2">Σύνολο</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b bg-white">
                                <td className="py-2">Πλατφόρμα OpenCouncil</td>
                                <td className="text-right">{months} μήνες</td>
                                <td className="text-right">{formatCurrency(offer.platformPrice)}/μήνα</td>
                                <td className="text-right">{formatCurrency(platformTotal)}</td>
                            </tr>
                            <tr className="border-b bg-white">
                                <td className="py-2">Ψηφιοποίηση συνεδριάσεων</td>
                                <td className="text-right">{offer.hoursToIngest} ώρες</td>
                                <td className="text-right">{formatCurrency(offer.ingestionPerHourPrice)}/ώρα</td>
                                <td className="text-right">{formatCurrency(ingestionTotal)}</td>
                            </tr>
                            {((offer as any).equipmentRentalName || (offer as any).equipmentRentalDescription) && (
                                <tr className="border-b bg-white">
                                    <td className="py-2">
                                        {(offer as any).equipmentRentalName || "Παροχή εξοπλισμού"}
                                    </td>
                                    <td className="text-right">{months} μήνες</td>
                                    <td className="text-right">{formatCurrency((offer as any).equipmentRentalPrice || 0)}/μήνα</td>
                                    <td className="text-right">{formatCurrency(equipmentRentalTotal)}</td>
                                </tr>
                            )}
                            {(offer as any).physicalPresenceHours && (offer as any).physicalPresenceHours > 0 && (
                                <tr className="border-b bg-white">
                                    <td className="py-2">Φυσική παρουσία σε συνεδριάσεις</td>
                                    <td className="text-right">{(offer as any).physicalPresenceHours} ώρες</td>
                                    <td className="text-right">{formatCurrency(PHYSICAL_PRESENCE.pricePerHour)}/ώρα</td>
                                    <td className="text-right">{formatCurrency(physicalPresenceTotal)}</td>
                                </tr>
                            )}
                            {offer.correctnessGuarantee && hoursToGuarantee && (
                                <tr className="border-b bg-white">
                                    <td className="py-2">Έλεγχος απομαγνητοφωνήσεων από άνθρωπο</td>
                                    <td className="text-right">
                                        {offer.version !== null && offer.version > 1
                                            ? `${hoursToGuarantee} ώρες`
                                            : `${hoursToGuarantee} συνεδριάσεις`
                                        }
                                    </td>
                                    <td className="text-right">
                                        {offer.version !== null && offer.version > 1
                                            ? `${formatCurrency(offer.version === 2 ? 20 : 11)}/ώρα`
                                            : `${formatCurrency(80)}/συνεδρίαση`
                                        }
                                    </td>
                                    <td className="text-right">{formatCurrency(correctnessGuaranteeCost)}</td>
                                </tr>
                            )}
                            <tr className="bg-white">
                                <td className="py-2">Πιλοτικές λειτουργίες</td>
                                <td className="text-right">∞</td>
                                <td className="text-right">{formatCurrency(0)}</td>
                                <td className="text-right">{formatCurrency(0)}</td>
                            </tr>
                            <tr className="border-b bg-white">
                                <td colSpan={3} className="text-right py-2">Μερικό Σύνολο</td>
                                <td className="text-right">{formatCurrency(subtotal)}</td>
                            </tr>
                            {discount > 0 && (
                                <tr className="border-b bg-white">
                                    <td colSpan={3} className="text-right py-2">Έκπτωση για {isRegion ? "την" : "το"} {offer.recipientName} ({offer.discountPercentage}%)</td>
                                    <td className="text-right">-{formatCurrency(discount)}</td>
                                </tr>
                            )}
                            <tr className="bg-white">
                                <td colSpan={3} className="text-right py-2 font-bold">Σύνολο (χωρίς ΦΠΑ)</td>
                                <td className="text-right font-bold">{formatCurrency(total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-sm text-gray-600">* Οι τιμές δεν περιλαμβάνουν ΦΠΑ</p>
            </section>

            <section className="mb-8 print:break-inside-avoid-page bg-white">
                <h3 className="text-2xl font-semibold mb-4">Προτεινόμενο πλάνο πληρωμών</h3>
                <div className="overflow-x-auto bg-white">
                    <table className="w-full min-w-[500px] print:text-xs print:w-full bg-white">
                        <thead>
                            <tr className="border-b bg-white">
                                <th className="text-left py-2">Ημερομηνία</th>
                                <th className="text-right py-2">Ποσό</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paymentPlan.map((payment, i) => (
                                <tr key={i} className="border-b bg-white">
                                    <td className="py-2">{formatDate(payment.dueDate)}</td>
                                    <td className="text-right">{formatCurrency(payment.amount)}</td>
                                </tr>
                            ))}
                            <tr className="bg-white">
                                <td className="py-2 font-bold">Σύνολο (χωρίς ΦΠΑ)</td>
                                <td className="text-right font-bold">{formatCurrency(total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-sm text-gray-600">* Οι τιμές δεν περιλαμβάνουν ΦΠΑ</p>
            </section>

            <CTABox />

            <section className="mb-8 print:break-inside-avoid-page">
                <h3 className="text-2xl font-semibold mb-4">Επεξήγηση</h3>
                <p className="mb-4">Αυτή η προσφορά αφορά κατά βάση δύο υπηρεσίες. Την εισαγωγή δημοσίων συνεδριάσεων (π.χ. {isRegion ? 'περιφερειακών' : 'δημοτικών'} συμβουλίων) στη πλατφόρμα του OpenCouncil, και την δυνατότητα ελεύθερης χρήσης της πλατφόρμας OpenCouncil από {isRegion ? 'την περιφέρεια' : 'το δήμο'} και τους {isRegion ? 'πολίτες' : 'δημότες'} {isRegion ? 'της περιφέρειας' : 'του δήμου'} κατά τη διάρκεια της περιόδου παροχής υπηρεσιών.</p>
                <div className="grid md:grid-cols-2 gap-4 print:gap-6">

                    <ModuleCard
                        title="Ψηφιοποίηση συνεδριάσεων"
                        subtitle="Απομαγνητοφώνηση δημοσίων συνεδριάσεων και ενσωμάτωσή τους στη πλατφόρμα OpenCouncil"
                        icon={<FileText className="w-10 h-10 mb-2" />}
                        restriction={`Μέχρι ${offer.hoursToIngest} ώρες δημόσιων συνεδριάσεων`}
                        className="print:break-inside-avoid"
                    >
                        <p>
                            Η ψηφιοποίηση συνεδριάσεων αφορά τη διαδικασία μετατροπής του βίντεο μιας συνεδρίασης σε μορφή κειμένου που είναι αναγνώσιμη από μηχανές,
                            και που περιέχει μεταδεδομένα που μπορούν να χρησιμοποιηθούν για τη χρήση της συνεδρίασης από την πλατφόρμα OpenCouncil.
                        </p>

                        <ul className="space-y-2 mt-4">
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Aπομαγνητοφώνηση και αναγνώριση ομιλητών, από το βίντεο και τον ήχο της συνεδρίασης.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Παραγωγή συνόψεων από κάθε τοποθέτηση που έγινε στη συνεδρίαση.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Αναγνώριση θεμάτων που συζητήθηκαν στη συνεδρίαση, και σύνδεση με την ημερήσια διάταξη.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Μετατροπή του οπτικοακουστικού υλικού σε μορφή MP4, MP3 καθώς και σε μορφή κατάλληλη για adaptive bitrate streaming.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Εισαγωγή των δεδομένων στη πλατφόρμα OpenCouncil, όπου γίνονται προσβάσιμα μέσω της σελίδας opencouncil.gr, του API και άλλων τρόπων.</span>
                            </li>
                            {offer.correctnessGuarantee ? (
                                <li className="flex items-start gap-2">
                                    <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                    <span>Η απομαγνητοφώνηση κάθε συνεδρίασης θα ελέγχονται από άνθρωπο για την ακρίβειά της, εντός 36 ωρών από τη συνεδρίαση, αλλά συχνά και πιο σύντομα.</span>
                                </li>
                            ) : (
                                <li className="flex items-start gap-2">
                                    <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                    <span>Η διαδικασία είναι αυτόματη, και τα δεδομένα που παράγονται μπορεί να περιέχουν λάθη. Όμως, δεσμευόμαστε να διορθώσουμε όποια λάθη προκύψουν από την αυτόματη διαδικασία, σύμφωνα με τη <a href='/corrections' className="underline">πολιτική διορθόσεων</a> μας.</span>
                                </li>
                            )}
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Δεσμευόμαστε να ολοκληρώσουμε τη διαδικασία της ψηφιοποίησης 24 ώρες αφότου το αρχικό βίντεο μιας συνεδρίασης γίνει διαθέσιμο. Όμως, προσπαθούμε να ολοκληρώνουμε αυτή τη διαδικασία σε λιγότερο από 2 ώρες.</span>
                            </li>
                        </ul>
                    </ModuleCard>
                    <ModuleCard
                        title="Πλατφόρμα ΟpenCouncil"
                        subtitle="Ελεύθερη χρήση της πλατφόρμας opencouncil.gr για όλους"
                        icon={<Building2 className="w-10 h-10 mb-2" />}
                        restriction="Απεριόριστη χρήση για όλους χωρίς περιορισμούς"
                    >
                        <p>
                            H πλατφόρμα OpenCouncil κάνει τις ψηφιοποιημένες συνεδριάσεις προσβάσιμες, χρήσιμες και κατανοητές σε όλους.
                        </p>
                        <ul className="space-y-2 mt-4">
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Η σελίδα {isRegion ? 'της περιφέρειας' : 'του δήμου'} στο <a href={`https://opencouncil.gr/${offer.cityId}`} className="underline">{`https://opencouncil.gr/${offer.cityId}`}</a>, διαθέσιμη από όλες τις σύγχρονες συσκευές και κινητά.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Πρόσβαση στα δεδομένα της ψηφιοποιημένης συνεδρίασης, όπως η απομαγνητοφώνηση, τα θέματα και οι συνόψεις των τοποθετήσεων σε ξεχωριστή σελίδα για κάθε συνεδρίαση.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Πρόσβαση σε στατιστικά σχετικά με τους χρόνους ομιλίας των παρατάξεων και των ομιλητών, καθώς και για τα θέματα που συζητούνται, για κάθε συνεδρίαση αλλά και για {isRegion ? 'την περιφέρεια' : 'το δήμο'} συνολικά.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Εξαγωγή απομαγνητοφωνήσεων σε PDF για κάθε συνεδρίαση.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Σελίδες παρατάξεων και ομιλητών για όλα τα μέλη του {isRegion ? 'περιφερειακού' : 'δημοτικού'} συμβουλίου, που θα εμφανίζουν στατιστικά καθώς και τις πρόσφατες τοποθετήσεις τους.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Εύκολη αναζήτηση των θεμάτων και απομαγνητοφωνήσεων.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Γρήγορο adaptive bitrate streaming για το οπτικοακουστικό υλικό κάθε συνεδρίασης.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Διαθεσιμότητα για όλους. Η πλατφόρμα προορίζεται για {isRegion ? 'την περιφέρεια' : 'το δήμο'} και τους {isRegion ? 'πολίτες' : 'δημότες'} {isRegion ? 'της' : 'του'}, όμως δεσμευόμαστε να μην κάνουμε ελέγχους ή περιορισμούς για την πρόσβαση στην πλατφόρμα.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Ανοιχτά δεδομένα (API) για όλους.</span>
                            </li>
                        </ul>
                    </ModuleCard>
                </div>

                {/* Equipment Rental and Physical Presence Services */}
                {(((offer as any).equipmentRentalName || (offer as any).equipmentRentalDescription) ||
                    ((offer as any).physicalPresenceHours && (offer as any).physicalPresenceHours > 0)) && (
                        <div className="mt-8 print:break-inside-avoid">
                            <h4 className="text-xl font-semibold mb-4">Επιπλέον Υπηρεσίες</h4>
                            <div className="grid gap-6">
                                {((offer as any).equipmentRentalName || (offer as any).equipmentRentalDescription) && (
                                    <Card className="print:break-inside-avoid">
                                        <CardHeader className="pb-4">
                                            <div className="flex items-center gap-3">
                                                <Package className="w-8 h-8 text-primary" />
                                                <div>
                                                    <CardTitle className="text-lg">
                                                        {(offer as any).equipmentRentalName || "Παροχή εξοπλισμού συνεδριάσεων"}
                                                    </CardTitle>
                                                    <CardDescription className="text-sm">
                                                        Παροχή εξοπλισμού για τη καταγραφή συνεδριάσεων
                                                    </CardDescription>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {(offer as any).equipmentRentalDescription && (
                                                <p className="text-gray-700">
                                                    {(offer as any).equipmentRentalDescription}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}

                                {(offer as any).physicalPresenceHours && (offer as any).physicalPresenceHours > 0 && (
                                    <Card className="print:break-inside-avoid">
                                        <CardHeader className="pb-4">
                                            <div className="flex items-center gap-3">
                                                <Clock className="w-8 h-8 text-primary" />
                                                <div>
                                                    <CardTitle className="text-lg">Φυσική παρουσία σε συνεδριάσεις</CardTitle>
                                                    <CardDescription className="text-sm">
                                                        Εξειδικευμένο προσωπικό για τεχνική υποστήριξη της καταγραφής κατά τη διάρκεια των συνεδριάσεων
                                                    </CardDescription>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-gray-700">
                                                Εξειδικευμένο προσωπικό θα είναι παρόν κατά τη διάρκεια των συνεδριάσεων για τεχνική υποστήριξη του εξοπλισμού καταγραφής και άμεση επίλυση τυχόν προβλημάτων.
                                            </p>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}
            </section>

            <section className="mb-8 print:break-inside-avoid-page">
                <h3 className="text-2xl font-semibold mb-4">Τεχνικές προδιαγραφές</h3>

                <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>H υπηρεσία προσφέρεται στο cloud της ΟpenCouncil, που φιλοξενείται στη Digital Ocean σε servers στην Ευρωπαϊκή Ένωση.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Θα καταβάλουμε κάθε δυνατή προσπάθεια για την μέγιστη δυνατή διαθεσιμότητα όλων των υπηρεσιών.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Μπορούμε να δουλέψουμε μαζί σας για τη χρήση κάποιου subdomain {isRegion ? 'της περιφέρειας' : 'του δήμου'}, όμως η πλατφόρμα του opencouncil για {isRegion ? 'την περιφέρεια' : 'το δήμο'} θα είναι διαθέσιμη και στο <a href="https://opencouncil.gr" className="underline">opencouncil.gr</a>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Η αυτόματη απομαγνητοφώνηση και αναγνώριση ομιλητών γίνεται με το Whisper της OpenAI, και το PyAnnote.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Χρησιμοποιούμε το Claude της Anthropic AI για τη παραγωγή συνόψεων, την εξαγωγή θεμάτων και άλλες υπηρεσίες.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Τα βίντεο των συνεδριάσεων προσφέρονται με adaptive bitrate streaming με χρήση του mux.com, σε ανάλυση ως και 720p.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Όλες οι τεχνολογίες και υπηρεσίες που χρησιμοποιούνται μπορεί να αλλάξουν μελλοντικά, καθώς νέες υπηρεσίες και τεχνολογίες γίνονται διαθέσιμες.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Η πλατφόρμα θα είναι διαθέσιμη σε όλες τις συσκευές, όπως κινητά, laptops, desktops, μέσω όλων των σύγχρονων περιηγητών διαδικτύου.</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                        <span>Η πολιτική απορρήτου μας είναι διαθέσιμη στο <a href="/privacy" className="underline">opencouncil.gr/privacy</a> και οι όροι χρήσης στο <a href="/terms" className="underline">opencouncil.gr/terms</a>.</span>
                    </li>
                </ul>
            </section>

            <section className="mb-8 print:break-inside-avoid-page">
                <h3 className="text-2xl font-semibold mb-4">Συμμετοχή σε πιλοτικές λειτουργίες</h3>
                <p className="mb-4">
                    <em>Εφόσων και όταν το επιθυμείτε, θα έχετε τη δυνατότητα να ενεργοποιήσετε τις ακόλουθες πιλοτικές λειτουργίες του OpenCouncil</em> κατά τη διάρκεια της περιόδου παροχής υπηρεσιών.
                    Αυτές οι λειτουργίες θα αναπτυχθούν σε συνεργασία με {isRegion ? 'την περιφέρεια' : 'το δήμο'}, και θα προσαρμοστούν στις ανάγκες {isRegion ? 'της' : 'του'}.
                    Οι λειτουργίες αυτές δεν είναι εγγυημένες αλλά θα παρέχονται κατόπιν προηγούμενης συνεννόησης. Η συμμετοχή στις πιλοτικές λειτουργίες θα είναι δωρεάν,
                    με τους περιορισμούς που περιγράφονται παρκάτω.
                </p>
                <div className="grid md:grid-cols-3 gap-4 print:gap-6">
                    <ModuleCard
                        title="Άμεση ενημέρωση και διαβούλευση"
                        subtitle="Αυτόματη δημιουργία και αποστολή προσωποποιημένων μηνυμάτων σε πολίτες"
                        icon={<MessageCircle className="w-10 h-10 mb-2" />}
                        restriction="Μέχρι 1000 ενεργοί λογαριασμοί πολιτών"
                    >
                        <li className="space-y-2">
                            <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                            <span>Δυνατότητα για τους πολίτες να εγγραφούν στο OpenCouncil, δίνοντας στοιχεία επικοινωνίας τους (αριθμόυς τηλεφώνου ή email) και μια λίστα από περιοχές και θέματα {isRegion ? 'της περιφέρειας' : 'του δήμου'} που τους αφορούν (π.χ. κάποιο συγκεκριμένο σχολείο, ένα πάρκο, μια γειτονιά).</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                            <span>Εξαγωγή θεμάτων που αφορούν τον κάθε {isRegion ? 'πολίτη' : 'δημότη'} ξεχωριστά, από την ημερήσια διάταξη και την απομαγνητοφώνηση της συνεδρίασης.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                            <span>Αποστολή προσωποποιημένων μηνυμάτων σε κάθε {isRegion ? 'πολίτη' : 'δημότη'} για θέματα που τους αφορούν και πρόκειται να συζητηθούν στην επόμενη συνεδρίαση.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                            <span>Δυνατότητα απάντησης από τους {isRegion ? 'πολίτες' : 'δημότες'}, και σύνοψη των απαντήσεων για τον εισηγητή του θέματος.</span>
                        </li>
                    </ModuleCard>
                    <ModuleCard
                        piloting
                        title="Podcast"
                        subtitle={`Αυτόματη παραγωγή και διανομή ενημερωτικών podcast για τους ${isRegion ? 'πολίτες' : 'δημότες'}`}
                        icon={<Mic className="w-10 h-10 mb-2" />}
                        restriction="Μέχρι 2 ώρες podcast το μήνα"
                    >
                        <ul className="space-y-2">
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Αυτόματη παραγωγή podcast για κάθε συνεδρίαση (δείτε ένα <a href="https://open.spotify.com/show/1rustvetXr9Z5qxMh1TdL2?si=cb1c603897f04aa0" className="underline">παράδειγμα</a>), με τα σημαντικότερα θέματα της ημέρας.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Δημοσίευση και προώθηση στο Spotify, Apple Podcasts και άλλες πλατφόρμες.</span>
                            </li>
                        </ul>
                    </ModuleCard>
                    <ModuleCard
                        title="Υλικό για social media"
                        subtitle="Αυτόματη παραγωγή και διανομή ενημερωτικού περιεχομένου στα social"
                        icon={<Smartphone className="w-10 h-10 mb-2" />}
                        restriction="Μέχρι 20 δημοσιεύσεις το μήνα"
                    >
                        <ul className="space-y-2">
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Αυτόματη παραγωγή σύντομων βίντεο και κειμένων μετά από κάθε συνεδρίαση, με τα σημαντικότερα σημεία κάθε θέματος, έτοιμα για δημοσίευση στα social media.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckSquare className="w-5 h-5 mt-0.5 shrink-0" />
                                <span>Δυνατότητα προγραμματισμού δημοσιεύσεων στο TikTok, Facebook, Instagram και Twitter.</span>
                            </li>
                        </ul>
                    </ModuleCard>
                </div>
            </section >
            <section className="mb-8 print:break-inside-avoid-page">
                <h3 className="text-2xl font-semibold mb-4">Επιπλέον δωρεάν προνόμια</h3>
                <ul className="grid md:grid-cols-2 gap-4 print:gap-6">
                    <li className="flex items-center">
                        <Phone className="w-5 h-5 mr-2" />
                        <span>Άμεση τηλεφωνική υποστήριξη για {isRegion ? 'την περιφέρεια' : 'το δήμο'} και τα μέλη των συμβουλίων</span>
                    </li>
                    <li className="flex items-center">
                        <Mail className="w-5 h-5 mr-2" />
                        <span>Τεχνική υποστήριξη μέσω email για {isRegion ? 'την περιφέρεια' : 'το δήμο'} και τους {isRegion ? 'πολίτες' : 'δημότες'}</span>
                    </li>
                    <li className="flex items-center">
                        <Database className="w-5 h-5 mr-2" />
                        <span>Ανοιχτά δεδομένα, με το <a href="/docs" className="underline">API του OpenCouncil</a></span>
                    </li>
                    <li className="flex items-center">
                        <Code className="w-5 h-5 mr-2" />
                        <span>Ανοιχτός κώδικας υπό την άδεια GPL v3</span>
                    </li>
                    <li className="flex items-center">
                        <Eraser className="w-5 h-5 mr-2" />
                        <span><a href="/corrections" className="underline">Πολιτική διορθώσεων</a></span>
                    </li>
                    <li className="flex items-center">
                        <Rocket className="w-5 h-5 mr-2" />
                        <span>Συνεχής ανάπτυξη και βελτίωση</span>
                    </li>
                    <li className="flex items-center">
                        <Package className="w-5 h-5 mr-2" />
                        <span>Μηδενικός κόπος ή κόστος ενσωμάτωσης</span>
                    </li>
                    <li className="flex items-center">
                        <Clock className="w-5 h-5 mr-2" />
                        <span>Δωρεάν δοκιμαστική περίοδος</span>
                    </li>
                </ul>
            </section>

            <div className="print:mt-12 print:break-before-page print:block">
                <section className="mb-8 print:break-inside-avoid">
                    <h3 className="text-2xl font-semibold mb-4">Στοιχεία Εταιρείας</h3>
                    <p className="">
                        OpenCouncil Μονοπρόσωπη Ι.Κ.Ε.<br />Λαλέχου 1, Νέο Ψυχικό 15451<br />ΑΦΜ 802666391 (ΚΕΦΟΔΕ Αττικής)<br />Aριθμός ΓΕΜΗ 180529301000.
                    </p>
                    <p className="mt-2">
                        H OpenCouncil ανήκει στην <a href="https://schemalabs.gr" className="underline">Schema Labs Αστική Μη Κερδοσκοπική Εταιρεία</a>.
                    </p>
                </section>
                <CTABox />
                <footer className="mt-8 text-right print:mt-12">
                    <p className="mb-4 print:mb-6">Με εκτίμηση,<br />εκ μέρους της ΟpenCouncil,</p>
                    <p className="font-bold">{offer.respondToName}</p>
                    <p>{offer.respondToEmail}</p>
                    <p>{offer.respondToPhone}</p>
                </footer>
            </div>

            <div className="fixed bottom-4 right-4 print:hidden">
                <Button onClick={() => window.print()}>Εκτύπωση</Button>
            </div>
        </div >
    )
}

export function OfferLetterNotice({ offer }: { offer: Offer }) {
    const [qrLoaded, setQrLoaded] = useState(false);

    return (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-8 flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center print:bg-blue-50 print:border-none">
            <div>
                <p className="hidden print:block">
                    Μπορείτε να δείτε τη πιο πρόσφατη έκδοση αυτής της προσφοράς ηλεκτρονικά σκανάροντας το QR code.
                </p>
                <p className="print:hidden">
                    Αυτή η προσφορά μπορεί να εκτυπωθεί και να αποθηκευτεί σαν PDF, ή μπορείτε να τη μοιραστείτε με συνεργάτες
                    σας αντιγράφοντας το σύνδεσμο.
                </p>
            </div>
            <div className="hidden print:block">
                <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://opencouncil.gr/offer-letter/${offer.id}`}
                    alt="QR Code"
                    width={100}
                    height={100}
                    onLoad={() => setQrLoaded(true)}
                    priority
                    className={qrLoaded ? 'opacity-100' : 'opacity-0'}
                    unoptimized
                />
            </div>
            <div className="print:hidden flex flex-col gap-2">
                <Button
                    onClick={() => window.print()}
                    className="flex items-center justify-center gap-2 w-full"
                >
                    <FileText className="w-4 h-4" />
                    Εκτύπωση
                </Button>
                <CopyToClipboardButton offer={offer} />
            </div>
        </div>
    );
}

function CopyToClipboardButton({ offer }: { offer: Offer }) {
    const [copied, setCopied] = useState(false);

    const handleClick = async () => {
        await navigator.clipboard.writeText(`https://opencouncil.gr/offer-letter/${offer.id}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button variant="outline" onClick={handleClick} className="w-full">
            {copied ? (
                <Check className="w-4 h-4 mr-2" />
            ) : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Αντιγράφηκε!' : 'Αντιγραφή σύνδεσμου'}
        </Button>
    );
}
function ModuleCard({ title, subtitle, icon, restriction, children, piloting, className }: {
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    restriction: string,
    children?: React.ReactNode,
    piloting?: boolean,
    className?: string
}) {
    return (
        <Card className={`print:break-inside-avoid p-4 flex flex-col ${className || ''}`}>
            <CardHeader>
                {icon}
                <div className="flex items-center gap-2">
                    <CardTitle>{title}</CardTitle>
                </div>
                <CardDescription>
                    {subtitle}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {children}
            </CardContent>
            <CardFooter className="mt-auto">
                <p className="text-sm text-muted-foreground font-bold">{restriction}</p>
            </CardFooter>
        </Card>
    )
}