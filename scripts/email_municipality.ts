
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

    <p><b>Επισυνάπτω τα ανεπίσημα, αυτόματα πρακτικά του OpenCouncil από την χθεσινή συνεδρίαση του δημοτικού συμβουλίου.</b></p>

    <p>
        Το OpenCouncil χρησιμοποιεί <b>τεχνητή νοημοσύνη</b> για να <b>κάνει τα δημοτικά συμβούλια πιο απλά και κατανοητά</b>.
        Τα πρακτικά που επισυνάπτουμε φτιάχτηκαν αυτόματα από το live streaming στο YouTube και την ημερήσια διάταξη. Μπορείτε να δείτε μια ψηφιακή σύνοψη της χθεσινής συνεδρίασης στο ${await link('https://opencouncil.gr/athens/jan29_2025', 'opencouncil.gr/athens/jan29_2025')}.
        Μπορείτε επίσης να δείτε τις τελευταίες 17 συνεδριάσεις του δημοτικού συμβουλίου της Αθήνας στο ${await link('https://opencouncil.gr/athens/', 'opencouncil.gr/athens/')}
        ${partyId && `καθώς και τις τοποθετήσεις της παράταξης σας ${await link(partyLink(partyId), 'πατώντας εδώ')}`}.
    </p>

    <p>Μπορείτε να διαβάσετε περισσότερα για το OpenCouncil σε ${await link(`https://schemalabs.substack.com/p/pencouncil`, 'αυτό')} και ${await link(`https://schemalabs.substack.com/p/funds-product-motives`, 'αυτό')} το blog post.</p>

    <p>Είμαστε μια μικρή ομάδα, μέρος της νεοσύστατης ${await link('https://schemalabs.gr', 'Schema Labs')}, μιας μη-κερδοσκοπικής εταιρείας που αναπτύσσει τεχνολογία για τους δημοκρατικούς θεσμούς.
    Δουλεύουμε καθημερινά στο να κάνουμε το OpenCouncil καλύτερο και πιο χρήσιμο, και θέλουμε τη βοήθεια σας: Παρακαλώ απαντήστε μου σε αυτό το email με όποια σχόλια έχετε,
    ή καλέστε με στο κινητό μου στο ${await link('tel:+306980586851', '6980586851')}. Θα χαρώ να σας ακούσω ή και να κάνουμε μια συνάντηση δια ζώσης, ώστε να σας εξηγήσουμε όλες τις τωρινές και επερχόμενες λειτουργίες του OpenCouncil
    (video reels, κατέβασμα αποσπασμάτων και απομαγνητοφωνήσεων, άτυπες διαβουλεύσεις κατοίκων για τα θέματα της ημερήσιας διάταξης από το WhatsApp και πολλά ακόμη)
    </p>

    <p>Με εκτίμηση,</p>
    <p>Χρήστος Πόριος</p>
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
                attachments: [
                    {
                        "filename": "συνεδρίαση_29_ιαν_opencouncil.docx",
                        "path": "https://townhalls-gr.fra1.cdn.digitaloceanspaces.com/council_meeting%20(14).docx"

                    }
                ]

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
                    '🤖 📄✨ Αυτόματα πρακτικά χθεσινού ΔΣ | OpenCouncil',
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
