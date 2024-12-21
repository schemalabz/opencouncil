import { Card, CardContent } from "../ui/card"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export default function SupersededOffer({ oldId, newId }: { oldId: string, newId: string }) {
    return (
        <div className="max-w-2xl mx-auto p-8">
            <Card className="bg-yellow-50">
                <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center gap-4">
                        <p className="text-lg">
                            Αυτή η προσφορά έχει ανανεωθεί. Μπορείτε να διαβάσετε τη πιο πρόσφατη έκδοση αυτής της προσφοράς πατώντας εδώ.
                        </p>
                        <Link
                            href={`/offer-letter/${newId}`}
                            className="flex items-center gap-2 text-primary hover:underline"
                        >
                            Προβολή νέας προσφοράς
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
