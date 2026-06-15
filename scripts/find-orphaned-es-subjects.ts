/**
 * Script to find and optionally delete orphaned subjects in Elasticsearch
 *
 * These are subjects that exist in Elasticsearch but not in PostgreSQL.
 */

import * as readline from 'readline';
import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';

const BATCH_SIZE = 1000;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  const options = {
    delete: false,
    transcribedOnly: false,
    json: false,
    quiet: false,
    help: false,
    yes: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--delete':
        options.delete = true;
        break;
      case '--transcribed-only':
        options.transcribedOnly = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--yes':
      case '-y':
        options.yes = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          console.error('Use --help for usage information');
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
find-orphaned-es-subjects - Find and delete orphaned Elasticsearch subjects

DESCRIPTION
  This script identifies subjects that exist in Elasticsearch but not in
  PostgreSQL.

USAGE
  npx tsx scripts/find-orphaned-es-subjects.ts [options]

OPTIONS
  --delete            Delete orphaned documents (default: dry run)
  --transcribed-only  Only process orphans from meetings that have been
                      transcribed (safer - these are definitely orphans)
  --json              Output results as JSON (useful for scripting)
  --quiet, -q         Minimal output (only show summary and errors)
  --yes, -y           Skip confirmation prompt when deleting
  --help, -h          Show this help message

EXAMPLES
  # Dry run - find all orphans without deleting
  npx tsx scripts/find-orphaned-es-subjects.ts

  # Find orphans with JSON output (for piping to other tools)
  npx tsx scripts/find-orphaned-es-subjects.ts --json

  # Delete only orphans from transcribed meetings (safest)
  npx tsx scripts/find-orphaned-es-subjects.ts --delete --transcribed-only

  # Delete all orphans with confirmation
  npx tsx scripts/find-orphaned-es-subjects.ts --delete

  # Delete all orphans without confirmation (for automation)
  npx tsx scripts/find-orphaned-es-subjects.ts --delete --yes --quiet

ENVIRONMENT VARIABLES
  ELASTICSEARCH_URL       Elasticsearch server URL (required)
  ELASTICSEARCH_API_KEY   Elasticsearch API key (required)
  ELASTICSEARCH_INDEX     Index name (default: "subjects")
  DATABASE_URL            PostgreSQL connection string (required by Prisma)

EXIT CODES
  0  Success (or no orphans found)
  1  Error occurred
`);
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Logger that respects quiet mode
function createLogger(quiet: boolean, json: boolean) {
  return {
    log: (...args: unknown[]) => {
      if (!quiet && !json) console.log(...args);
    },
    info: (...args: unknown[]) => {
      if (!json) console.log(...args);
    },
    error: (...args: unknown[]) => {
      console.error(...args);
    },
  };
}

interface SubjectDocument {
  id: string;
  name: string;
  city_id: string;
  city_name: string;
  councilMeeting_id: string;
  meeting_name: string;
  meeting_date: string;
  meeting_released: boolean;
  created_at: string;
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const log = createLogger(options.quiet, options.json);

  // Initialize clients
  const prisma = new PrismaClient();

  const esUrl = process.env.ELASTICSEARCH_URL;
  const esApiKey = process.env.ELASTICSEARCH_API_KEY;
  const esIndex = process.env.ELASTICSEARCH_INDEX || 'subjects';

  if (!esUrl || !esApiKey) {
    log.error('Missing ELASTICSEARCH_URL or ELASTICSEARCH_API_KEY environment variables');
    process.exit(1);
  }

  const es = new Client({
    node: esUrl,
    auth: { apiKey: esApiKey }
  });

  log.log(`Connecting to Elasticsearch index: ${esIndex}`);
  log.log(`Mode: ${options.delete ? 'DELETE' : 'DRY RUN (use --delete to actually delete)'}`);
  if (options.transcribedOnly) {
    log.log(`Filter: Only processing orphans from TRANSCRIBED meetings`);
  }
  log.log();

  try {
    // Step 1: Get total count from Elasticsearch
    const countResponse = await es.count({ index: esIndex });
    const totalEsDocuments = countResponse.count;
    log.log(`Total documents in Elasticsearch: ${totalEsDocuments}`);

    // Step 2: Get total count from PostgreSQL
    const totalPgSubjects = await prisma.subject.count();
    log.log(`Total subjects in PostgreSQL: ${totalPgSubjects}`);
    log.log(`Difference: ${totalEsDocuments - totalPgSubjects} potential orphans\n`);

    // Step 3: Fetch all documents from Elasticsearch using scroll API
    log.log('Fetching all subjects from Elasticsearch...');
    const esDocuments = new Map<string, SubjectDocument>();

    let scrollId: string | undefined;
    let response = await es.search({
      index: esIndex,
      scroll: '2m',
      size: BATCH_SIZE,
      _source: ['id', 'name', 'city_id', 'city_name', 'councilMeeting_id', 'meeting_name', 'meeting_date', 'meeting_released', 'created_at'],
      query: { match_all: {} }
    });

    while (response.hits.hits.length > 0) {
      for (const hit of response.hits.hits) {
        const source = hit._source as SubjectDocument;
        esDocuments.set(hit._id!, source);
      }
      log.log(`  Fetched ${esDocuments.size} documents...`);

      scrollId = response._scroll_id;
      response = await es.scroll({
        scroll_id: scrollId,
        scroll: '2m'
      });
    }

    // Clear scroll context
    if (scrollId) {
      await es.clearScroll({ scroll_id: scrollId });
    }

    log.log(`Total documents fetched from Elasticsearch: ${esDocuments.size}\n`);

    // Step 4: Check which IDs exist in PostgreSQL
    log.log('Checking which IDs exist in PostgreSQL...');
    const esIdsArray = Array.from(esDocuments.keys());
    const existingIds = new Set<string>();

    // Query PostgreSQL in batches
    for (let i = 0; i < esIdsArray.length; i += BATCH_SIZE) {
      const batch = esIdsArray.slice(i, i + BATCH_SIZE);
      const existingSubjects = await prisma.subject.findMany({
        where: { id: { in: batch } },
        select: { id: true }
      });

      for (const subject of existingSubjects) {
        existingIds.add(subject.id);
      }

      log.log(`  Checked ${Math.min(i + BATCH_SIZE, esIdsArray.length)}/${esIdsArray.length} IDs...`);
    }

    // Step 5: Find orphaned documents
    const orphanedDocs = esIdsArray
      .filter(id => !existingIds.has(id))
      .map(id => ({ esId: id, ...esDocuments.get(id)! }));

    log.log(`\n${'='.repeat(80)}`);
    log.log(`RESULTS`);
    log.log(`${'='.repeat(80)}`);
    log.log(`Documents in Elasticsearch: ${esDocuments.size}`);
    log.log(`IDs found in PostgreSQL: ${existingIds.size}`);
    log.log(`Orphaned documents: ${orphanedDocs.length}`);

    if (orphanedDocs.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ orphanedDocuments: 0, deleted: 0 }));
      } else {
        log.info('No orphaned documents found. Elasticsearch and PostgreSQL are in sync.');
      }
      return;
    }

    // Step 6: Find task info for orphaned meetings
    log.log('\nChecking task status for orphaned meetings...');
    const uniqueMeetingKeys = [...new Set(orphanedDocs.map(d => `${d.city_id}|${d.councilMeeting_id}`))];
    const transcribedMeetings = new Set<string>();
    const processAgendaCountByMeeting = new Map<string, number>();

    // Query TaskStatus for all succeeded transcribe tasks
    const allTranscribeTasks = await prisma.taskStatus.findMany({
      where: {
        type: 'transcribe',
        status: 'succeeded'
      },
      select: {
        cityId: true,
        councilMeetingId: true
      }
    });

    // Query TaskStatus for all processAgenda tasks (any status, to count how many times it ran)
    const allProcessAgendaTasks = await prisma.taskStatus.findMany({
      where: {
        type: 'processAgenda'
      },
      select: {
        cityId: true,
        councilMeetingId: true,
        status: true
      }
    });

    // Query TaskStatus for all summarize tasks (any status, to count how many times it ran)
    const allSummarizeTasks = await prisma.taskStatus.findMany({
      where: {
        type: 'summarize'
      },
      select: {
        cityId: true,
        councilMeetingId: true,
        status: true
      }
    });

    log.log(`  Total transcribe tasks (succeeded): ${allTranscribeTasks.length}`);
    log.log(`  Total processAgenda tasks (any status): ${allProcessAgendaTasks.length}`);
    log.log(`  Total summarize tasks (any status): ${allSummarizeTasks.length}`);

    // Build transcribed meetings set
    for (const task of allTranscribeTasks) {
      const key = `${task.cityId}|${task.councilMeetingId}`;
      if (uniqueMeetingKeys.includes(key)) {
        transcribedMeetings.add(key);
      }
    }

    // Count processAgenda tasks per meeting
    for (const task of allProcessAgendaTasks) {
      const key = `${task.cityId}|${task.councilMeetingId}`;
      if (uniqueMeetingKeys.includes(key)) {
        processAgendaCountByMeeting.set(key, (processAgendaCountByMeeting.get(key) || 0) + 1);
      }
    }

    // Count summarize tasks per meeting
    const summarizeCountByMeeting = new Map<string, number>();
    for (const task of allSummarizeTasks) {
      const key = `${task.cityId}|${task.councilMeetingId}`;
      if (uniqueMeetingKeys.includes(key)) {
        summarizeCountByMeeting.set(key, (summarizeCountByMeeting.get(key) || 0) + 1);
      }
    }

    log.log(`  Meetings with orphans that have been transcribed: ${transcribedMeetings.size}`);
    log.log(`  Meetings with orphans that have processAgenda tasks: ${processAgendaCountByMeeting.size}`);
    log.log(`  Meetings with orphans that have summarize tasks: ${summarizeCountByMeeting.size}`);

    // Group orphaned documents by city and meeting for better overview
    const byMeeting = new Map<string, { cityId: string; meetingId: string; city: string; meeting: string; meetingDate: string; transcribed: boolean; processAgendaCount: number; summarizeCount: number; subjects: typeof orphanedDocs }>();
    for (const doc of orphanedDocs) {
      const key = `${doc.city_id}|${doc.councilMeeting_id}`;
      if (!byMeeting.has(key)) {
        byMeeting.set(key, {
          cityId: doc.city_id,
          meetingId: doc.councilMeeting_id,
          city: doc.city_name || doc.city_id,
          meeting: doc.meeting_name || doc.councilMeeting_id,
          meetingDate: doc.meeting_date ? new Date(doc.meeting_date).toLocaleDateString() : 'unknown',
          transcribed: transcribedMeetings.has(key),
          processAgendaCount: processAgendaCountByMeeting.get(key) || 0,
          summarizeCount: summarizeCountByMeeting.get(key) || 0,
          subjects: []
        });
      }
      byMeeting.get(key)!.subjects.push(doc);
    }

    // Separate transcribed vs not-yet-transcribed meetings
    const transcribedMeetingsList = Array.from(byMeeting.entries()).filter(([, g]) => g.transcribed === true);
    const notTranscribedMeetings = Array.from(byMeeting.entries()).filter(([, g]) => g.transcribed === false);

    const transcribedOrphanCount = transcribedMeetingsList.reduce((sum, [, g]) => sum + g.subjects.length, 0);
    const notTranscribedOrphanCount = notTranscribedMeetings.reduce((sum, [, g]) => sum + g.subjects.length, 0);

    log.log(`\n${'='.repeat(80)}`);
    log.log(`BREAKDOWN BY TRANSCRIPTION STATUS`);
    log.log(`${'='.repeat(80)}`);
    log.log(`  Transcribed meetings:     ${transcribedMeetingsList.length} meetings, ${transcribedOrphanCount} orphaned subjects`);
    log.log(`  Not-yet-transcribed:      ${notTranscribedMeetings.length} meetings, ${notTranscribedOrphanCount} orphaned subjects`);

    if (transcribedMeetingsList.length > 0) {
      log.log(`\n${'='.repeat(80)}`);
      log.log(`ORPHANED SUBJECTS FROM TRANSCRIBED MEETINGS (these are the real orphans)`);
      log.log(`${'='.repeat(80)}`);

      for (const [key, group] of transcribedMeetingsList) {
        log.log(`\n📍 ${group.city} - ${group.meeting} (${group.meetingDate}) [TRANSCRIBED]`);
        log.log(`   Meeting ID: ${key.split('|')[1]}`);
        log.log(`   Orphaned subjects: ${group.subjects.length}`);
        log.log(`   ${'─'.repeat(70)}`);

        for (const doc of group.subjects) {
          const createdAt = doc.created_at ? new Date(doc.created_at).toLocaleString() : 'unknown';
          const truncatedName = doc.name && doc.name.length > 60 ? doc.name.substring(0, 60) + '...' : (doc.name || 'No name');
          log.log(`   • ${doc.id}`);
          log.log(`     Name: ${truncatedName}`);
          log.log(`     Created: ${createdAt}`);
        }
      }
    }

    if (notTranscribedMeetings.length > 0) {
      log.log(`\n${'='.repeat(80)}`);
      log.log(`ORPHANED SUBJECTS FROM NOT-YET-TRANSCRIBED MEETINGS`);
      log.log(`${'='.repeat(80)}`);
      log.log(`(These meetings haven't been transcribed yet - agenda may have been reprocessed)`);

      for (const [key, group] of notTranscribedMeetings) {
        log.log(`\n📍 ${group.city} - ${group.meeting} (${group.meetingDate}) [NOT TRANSCRIBED]`);
        log.log(`   Meeting ID: ${key.split('|')[1]}`);
        log.log(`   Orphaned subjects: ${group.subjects.length}`);
        log.log(`   ${'─'.repeat(70)}`);

        for (const doc of group.subjects) {
          const createdAt = doc.created_at ? new Date(doc.created_at).toLocaleString() : 'unknown';
          const truncatedName = doc.name && doc.name.length > 60 ? doc.name.substring(0, 60) + '...' : (doc.name || 'No name');
          log.log(`   • ${doc.id}`);
          log.log(`     Name: ${truncatedName}`);
          log.log(`     Created: ${createdAt}`);
        }
      }
    }

    // Summary table
    log.log(`\n${'='.repeat(155)}`);
    log.log(`SUMMARY BY MEETING`);
    log.log(`${'='.repeat(155)}`);
    log.log(`${'City'.padEnd(14)} ${'Meeting'.padEnd(24)} ${'Date'.padEnd(12)} ${'Transcr'.padEnd(8)} ${'#Agenda'.padEnd(8)} ${'#Summar'.padEnd(8)} ${'Orphans'.padEnd(8)} ${'cityId/meetingId'}`);
    log.log(`${'─'.repeat(155)}`);
    for (const [, group] of byMeeting) {
      const cityName = group.city.length > 12 ? group.city.substring(0, 12) + '..' : group.city;
      const meetingName = group.meeting.length > 22 ? group.meeting.substring(0, 22) + '..' : group.meeting;
      const transcribedStr = group.transcribed ? 'Yes' : 'No';
      const idPath = `${group.cityId}/${group.meetingId}`;
      log.log(`${cityName.padEnd(14)} ${meetingName.padEnd(24)} ${group.meetingDate.padEnd(12)} ${transcribedStr.padEnd(8)} ${String(group.processAgendaCount).padEnd(8)} ${String(group.summarizeCount).padEnd(8)} ${String(group.subjects.length).padEnd(8)} ${idPath}`);
    }

    // Step 7: Optionally delete orphaned documents
    // Build set of transcribed meeting keys for filtering
    const transcribedMeetingKeys = new Set(transcribedMeetingsList.map(([key]) => key));
    const docsToDelete = options.transcribedOnly
      ? orphanedDocs.filter(d => transcribedMeetingKeys.has(`${d.city_id}|${d.councilMeeting_id}`))
      : orphanedDocs;
    const orphanedIds = docsToDelete.map(d => d.id);

    // JSON output mode
    if (options.json) {
      const jsonOutput = {
        totalEsDocuments: esDocuments.size,
        totalPgSubjects: existingIds.size,
        orphanedDocuments: orphanedDocs.length,
        transcribedMeetings: {
          count: transcribedMeetingsList.length,
          orphanedSubjects: transcribedOrphanCount,
        },
        notTranscribedMeetings: {
          count: notTranscribedMeetings.length,
          orphanedSubjects: notTranscribedOrphanCount,
        },
        meetings: Array.from(byMeeting.values()).map(g => ({
          cityId: g.cityId,
          meetingId: g.meetingId,
          city: g.city,
          meeting: g.meeting,
          meetingDate: g.meetingDate,
          transcribed: g.transcribed,
          processAgendaCount: g.processAgendaCount,
          summarizeCount: g.summarizeCount,
          orphanedSubjects: g.subjects.length,
          subjectIds: g.subjects.map(s => s.id),
        })),
        toDelete: options.delete ? orphanedIds.length : 0,
        deleted: 0,
      };

      if (options.delete && orphanedIds.length > 0) {
        // Perform deletion in JSON mode
        const operations = orphanedIds.flatMap(id => [
          { delete: { _index: esIndex, _id: id } }
        ]);
        const bulkResponse = await es.bulk({ operations, refresh: true });
        const deletedCount = bulkResponse.errors
          ? bulkResponse.items.filter(item => !item.delete?.error).length
          : orphanedIds.length;
        jsonOutput.deleted = deletedCount;
      }

      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    if (options.delete) {
      if (orphanedIds.length === 0) {
        log.info(`No orphaned documents to delete${options.transcribedOnly ? ' from transcribed meetings' : ''}.`);
      } else {
        if (options.transcribedOnly) {
          log.info(`\nWill delete ${orphanedIds.length} orphaned documents from TRANSCRIBED meetings.`);
          log.info(`(Skipping ${orphanedDocs.length - orphanedIds.length} orphans from not-yet-transcribed meetings)`);
        } else {
          log.info(`\nWill delete ${orphanedIds.length} orphaned documents from Elasticsearch.`);
        }

        // Confirmation prompt (unless --yes flag is provided)
        if (!options.yes) {
          const confirmed = await confirm(`\nAre you sure you want to delete ${orphanedIds.length} documents?`);
          if (!confirmed) {
            log.info('Deletion cancelled.');
            return;
          }
        }

        log.log('Deleting...');

        // Use bulk delete for efficiency
        const operations = orphanedIds.flatMap(id => [
          { delete: { _index: esIndex, _id: id } }
        ]);

        const bulkResponse = await es.bulk({ operations, refresh: true });

        if (bulkResponse.errors) {
          log.error('Some deletions failed:');
          for (const item of bulkResponse.items) {
            if (item.delete?.error) {
              log.error(`  - ${item.delete._id}: ${item.delete.error.reason}`);
            }
          }
        } else {
          log.info(`Successfully deleted ${orphanedIds.length} orphaned documents.`);
        }
      }
    } else {
      log.log(`\n${'='.repeat(80)}`);
      log.log(`NEXT STEPS`);
      log.log(`${'='.repeat(80)}`);
      log.log(`\nTo delete ALL orphaned documents, run:`);
      log.log(`  npx tsx scripts/find-orphaned-es-subjects.ts --delete`);

      if (transcribedOrphanCount > 0 && notTranscribedOrphanCount > 0) {
        log.log(`\nTo delete ONLY orphans from transcribed meetings (safer), run:`);
        log.log(`  npx tsx scripts/find-orphaned-es-subjects.ts --delete --transcribed-only`);
      }

      // Also output curl commands for manual deletion
      log.log(`\nOr delete manually with curl:`);
      const idsToShow = options.transcribedOnly ? docsToDelete.map(d => d.id) : orphanedIds;
      for (const id of idsToShow.slice(0, 3)) {
        log.log(`  curl -X DELETE "$ELASTICSEARCH_URL/${esIndex}/_doc/${id}" -H "Authorization: ApiKey $ELASTICSEARCH_API_KEY"`);
      }
      if (idsToShow.length > 3) {
        log.log(`  ... and ${idsToShow.length - 3} more`);
      }
    }

  } catch (error) {
    log.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
