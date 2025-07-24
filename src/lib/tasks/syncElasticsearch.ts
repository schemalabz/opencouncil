'use server';

import { SyncElasticsearchRequest, SyncElasticsearchResult } from '../apiTypes';
import { startTask } from './tasks';
import prisma from '@/lib/db/prisma';

export const requestSyncElasticsearch = async (
  cityId: string,
  meetingId: string,
  jobType: 'full' | 'incremental',
  options: { force?: boolean } = {}
) => {
  const requestBody: Omit<SyncElasticsearchRequest, 'callbackUrl'> = {
    job_type: jobType,
    trigger_method: 'on_demand',
  };

  await startTask(
    'syncElasticsearch',
    requestBody,
    meetingId,
    cityId,
    options
  );
};

export const handleSyncElasticsearchResult = async (
    taskId: string,
    result: SyncElasticsearchResult
    ) => {
    // For now, we just log the result.
    // In the future, we can add more logic here, like sending notifications.
    console.log(
        `Handling SyncElasticsearchResult for taskId: ${taskId}, result: ${JSON.stringify(
        result,
        null,
        2
        )}`
    );
}; 