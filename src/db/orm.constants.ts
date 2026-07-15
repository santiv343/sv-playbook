import { gatewaySchema } from '../gateway/schema.constants.js';
import { orchestrationSchema } from '../orchestration/schema.constants.js';
import { taskSchema } from '../tasks/schema.constants.js';
import { reviewSchema } from '../review/schema.constants.js';

export const STORE_SCHEMA = { ...orchestrationSchema, ...gatewaySchema, ...taskSchema, ...reviewSchema };
