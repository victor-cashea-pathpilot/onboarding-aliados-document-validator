import { CloudTasksClient, protos } from '@google-cloud/tasks';
import type { JobRecord } from '@domain';
import { getInfrastructureSettings, requireCloudTasksSettings } from '../config/settings';
import { createLogger } from '../logging/logger';
import type { JobDispatcher } from './job-dispatcher';

const logger = createLogger('CloudTasksJobDispatcher');

export class CloudTasksJobDispatcher implements JobDispatcher {
  private readonly client: CloudTasksClient;

  constructor(client?: CloudTasksClient) {
    this.client = client ?? new CloudTasksClient();
  }

  async dispatch(job: JobRecord): Promise<void> {
    const settings = requireCloudTasksSettings(getInfrastructureSettings());
    const queuePath = this.client.queuePath(
      settings.gcpProjectId,
      settings.gcpRegion,
      settings.cloudTasksQueueId,
    );

    const task: protos.google.cloud.tasks.v2.ITask = {
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: `${settings.workerBaseUrl.replace(/\/$/, '')}/internal/process-job`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({ job_id: job.jobId })).toString('base64'),
      },
    };

    if (settings.cloudTasksServiceAccountEmail) {
      task.httpRequest!.oidcToken = {
        serviceAccountEmail: settings.cloudTasksServiceAccountEmail,
        audience: settings.workerAudience ?? settings.workerBaseUrl.replace(/\/$/, ''),
      };
    }

    if (settings.workerAuthToken) {
      task.httpRequest!.headers = {
        ...task.httpRequest!.headers,
        'X-Worker-Token': settings.workerAuthToken,
      };
    }

    await this.client.createTask({
      parent: queuePath,
      task,
    });

    logger.info('job.dispatched.cloud_tasks', {
      event: 'job.dispatched.cloud_tasks',
      jobId: job.jobId,
      merchantId: job.merchantId,
      requestId: job.requestId,
      queueId: settings.cloudTasksQueueId,
      workerUrl: `${settings.workerBaseUrl.replace(/\/$/, '')}/internal/process-job`,
    });
  }
}
