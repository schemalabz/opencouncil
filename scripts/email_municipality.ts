
import fs from 'fs';
import csv from 'csv-parser';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const CITY = 'athens';
const homeLink = 'https://opencouncil.gr';
const tweetLink = 'https://x.com/ChristosPorios/status/1833543940764479791';
const cityLink = () => `https://opencouncil.gr/${CITY}`;
const personLink = (personId: string) => `${cityLink()}/people/${personId}`;
const partyLink = (partyId: string) => `${cityLink()}/parties/${partyId}`;
const calendlyLink = 'https://calendly.com/christos-opencouncil/30min';


const is404Memo = new Map<string, boolean>();

const is404 = async (url: string) => {
    if (url.startsWith('tel:') || url.startsWith('mailto:')) {
        return false;
    }
    if (is404Memo.has(url)) {
        return is404Memo.get(url);
    }
    const response = await fetch(url);
    const is404 = response.status === 404;
    is404Memo.set(url, is404);
    return is404;
}

const link = async (url: string, name: string) => {
    if (await is404(url)) {
        throw new Error(`404 for ${url}`);
    }
    return `<a href='${url}'>${name}</a>`;
}

const emailBodyToPerson = async ({
    email,
    role,
    name,
    greeting,
    isPartyLeader,
    partyId,
    personId
}: {
    email: string;
    role: string;
    name: string;
    greeting: string;
    isPartyLeader: boolean;
    partyId: string;
    personId?: string;
}) => {
    return `
    <p>${greeting}</p>

    <p>Λέγομαι Χρήστος Πόριος, και σας στέλνω σχετικά με το ${await link(homeLink, 'opencouncil.gr')}, μια πλατφόρμα που κάνει
    ${await link(tweetLink, 'τις συνεδριάσεις δημοτικών συμβουλίων πιο κατανοητές και προσβάσιμες για όλους')}, με χρήση τεχνητής νοημοσύνης.
    Οι πρόσφατες συνεδριάσεις του δημοτικού συμβουλίου της τρέχουσας δημοτικής περιόδου του δήμου Αθηναίων είναι ήδη
    ${await link(cityLink(), 'διαθέσιμες και αναζητήσιμες εδώ')}.</p>

    ${personId && partyId ? `<p>Μπορείτε να δείτε στατιστικά για τη συμμετοχή σας στα ΔΣ, καθώς και τις πρόσφατες
    τοποθετήσεις σας ${await link(personLink(personId), 'στη σελίδα σας στο ΟpenCouncil')}.
    Μπορείτε επίσης να δείτε ${await link(partyLink(partyId), 'στατιστικά για τη παράταξη σας εδώ')}.</p>` : ''}

    <p>Το OpenCouncil κάνει <b>αυτόματη απομαγνητοφώνηση</b> στις συνεδριάσεις του δήμου, <b>αναγνωρίζει ομιλητές</b>,
    φτιάχνει <b>περιλήψεις τοποθετήσεων</b>, <b>εξάγει στατιστικά</b>, προσφέρει τη δυνατότητα <b>γρήγορης αναζήτησης</b> σε ό,τι έχει ειπωθεί στα δημοτικά συμβούλια,
    και παράγει αυτόματα <b>βίντεο reels</b> για θέματα που συζητούνται σε κάθε δημοτικό συμβούλιο.</p>

    <p>Θέλω να κάνω το OpenCouncil όσο το δυνατόν πιο χρήσιμο για εσάς, το δήμο και τους δημότες.
    Θα χαιρόμουν ιδιαίτερα αν είχατε λίγο χρόνο για να σας δείξω τις βασικές λειτουργίες του OpenCouncil
    και να μου πείτε τις ιδέες σας για το πως μπορεί να γίνει ακόμα πιο χρήσιμο.</p>

    <p>${role ?
            `Είμαι στη διάθεση σας για να κανονίσουμε μια συνάντηση από κοντά, το κινητό μου είναι το ${await link('tel:+306980586851', '+30 6980586851')}.
             Εναλλακτικά, μπορείτε να μου απαντήσετε με το ποιές ώρες σας βολεύουν για κάνουμε μια διαδικτυακή συνάντηση,
             ή να κλείσετε χρόνο μαζί μου στο ${await link(calendlyLink, 'calendly')}.`
            :
            `Είμαι στη διάθεση σας για μια διαδικτυακή συνάντηση. Μπορείτε να βρείτε χρόνο που σας βολεύει στο ${await link(calendlyLink, 'calendly')}.`
        }</p>

        <p>Χρήστος</p>
        `;
}
async function sendEmail(to: string, subject: string, html: string, dryRun: boolean, testSendAddress: string | undefined) {
    const recipients = testSendAddress ? [testSendAddress] : to.split(',').map(email => email.trim());
    if (dryRun) {
        console.log(`Would send email to: ${recipients.join(', ')}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content: ${html}`);
    } else {
        try {
            const result = await resend.emails.send({
                from: 'Χρήστος Πόριος <christos@opencouncil.gr>',
                to: recipients,
                cc: 'hello@opencouncil.gr',
                replyTo: 'christos@opencouncil.gr',
                subject,
                html,
            });
            console.log(`Email sent to ${recipients.join(', ')}. Result:`, result);
        } catch (error) {
            console.error(`Failed to send email to ${recipients.join(', ')}:`, error);
        }
    }
}

async function processCSV(filePath: string, dryRun: boolean, testSendAddress: string | undefined) {
    const results: any[] = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            let skipped = 0;
            for (const row of results) {
                if (!row.email || row.email === '') {
                    console.log('Skipping row with no email for ', row.name);
                    skipped++;
                    continue;
                }
                const emailContent = await emailBodyToPerson({
                    email: row.email,
                    role: row.role === '' ? undefined : row.role,
                    name: row.name,
                    greeting: row.addressAs,
                    isPartyLeader: row.headOfPArty === 'yes',
                    partyId: row.partyId,
                    personId: row.id,
                });

                await sendEmail(
                    row.email,
                    'Σχετικά με το OpenCouncil.gr',
                    emailContent,
                    dryRun,
                    testSendAddress
                );

                await sleep(1000);
            }

            console.log('Done, sent emails to', results.length, 'people, of which', skipped, 'were skipped');
        });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const argv = yargs(hideBin(process.argv))
    .option('csv', {
        alias: 'c',
        type: 'string',
        description: 'Path to the CSV file',
        demandOption: true
    })
    .option('execute', {
        alias: 'e',
        type: 'boolean',
        description: 'Execute the email sending',
        default: false
    })
    .option('test-send', {
        alias: 't',
        type: 'string',
        description: 'Send all emails to this test address',
        default: undefined
    })
    .help()
    .parseSync();

if (!argv.csv) {
    console.error('Please provide a path to the CSV file.');
    process.exit(1);
}

processCSV(path.resolve(argv.csv), !argv.execute, argv['test-send']);
