import { ContextError } from '../../context/context.errors.js';
import { digest } from '../../context/digest.js';
import { HTTP_METHOD } from '../../platform.constants.js';
import type {
  AdapterCancellationReceipt,
  AdapterObservationRequest,
  AdapterOperationRequest,
  AdapterProfileReceipt,
  AdapterRunObservation,
  AdapterSessionReceipt,
  AdapterTurnReceipt,
  AdapterTurnRequest,
  AgentAdapter,
  RunSpec,
} from '../gateway.types.js';
import { OPENCODE_ADAPTER_ID, openCodeSessionAbortPath } from './opencode.constants.js';
import {
  adapterConfig,
  createOpenCodeSession,
  endpoint,
  health,
  observeOpenCodeRun,
  submitPrompt,
  toolPolicy,
  verifyAgent,
  verifySession,
} from './opencode.js';

export class OpenCodeAdapter implements AgentAdapter {
  readonly id = OPENCODE_ADAPTER_ID;

  async verifyProfile(runSpec: RunSpec, directory: string): Promise<AdapterProfileReceipt> {
    const config = adapterConfig(runSpec.executionProfile);
    const serverVersion = await health(config);
    await verifyAgent(config, runSpec.executionProfile, directory);
    const tools = await toolPolicy(config, runSpec.executionProfile, directory);
    const profileDigest = digest({ serverVersion, profile: runSpec.executionProfile, tools, directory });
    return { adapterId: this.id, profileDigest, evidence: { serverVersion, tools } };
  }

  async createSession(request: AdapterOperationRequest, profile: AdapterProfileReceipt): Promise<AdapterSessionReceipt> {
    const config = adapterConfig(request.runSpec.executionProfile);
    const session = await createOpenCodeSession(config, request);
    const sessionId = verifySession(session, request);
    return {
      adapterId: this.id,
      sessionId,
      profileDigest: profile.profileDigest,
      sessionReceipt: { operationKey: request.operationKey, status: 'confirmed' },
    };
  }

  async submitTurn(request: AdapterTurnRequest): Promise<AdapterTurnReceipt> {
    const config = adapterConfig(request.runSpec.executionProfile);
    const id = await submitPrompt(config, request, { ...request.runSpec.executionProfile.tools });
    return {
      adapterId: this.id,
      sessionId: request.sessionId,
      messageId: id,
      submissionReceipt: {
        operationKey: request.operationKey,
        promptDigest: digest(request.prompt),
        deliveryStatus: 'accepted',
      },
    };
  }

  async observeRun(request: AdapterObservationRequest): Promise<AdapterRunObservation> {
    return observeOpenCodeRun(adapterConfig(request.runSpec.executionProfile), request);
  }

  async cancelRun(request: AdapterObservationRequest): Promise<AdapterCancellationReceipt> {
    const config = adapterConfig(request.runSpec.executionProfile);
    const response = await fetch(endpoint(config, openCodeSessionAbortPath(request.sessionId), request.directory), {
      method: HTTP_METHOD.POST,
    });
    if (!response.ok) throw new ContextError('ADAPTER_HTTP_ERROR', `abort session returned HTTP ${response.status}`);
    return {
      adapterId: this.id,
      sessionId: request.sessionId,
      messageId: request.messageId,
      acknowledged: true,
      evidence: { httpStatus: response.status },
    };
  }
}
