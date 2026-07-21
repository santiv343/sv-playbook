import { gatewaySchema } from '../gateway/schema.constants.js';
import { orchestrationSchema } from '../orchestration/schema.constants.js';
import { taskSchema } from '../tasks/schema.constants.js';
import { reviewSchema } from '../review/schema.constants.js';
import { promotionSchema } from '../promotion/promotion.schema.constants.js';

// El schema COMPLETO que createStoreOrm (orm.ts) le pasa a Drizzle — junta
// los schemas parciales de cada dominio (gateway/orchestration/tasks/
// review/promotion; roles y context tienen los suyos propios importados en
// otro lado) en un único objeto. Faltan aquí algunos dominios porque no
// todos exponen un *Schema barrel — no es necesariamente exhaustivo de
// TODAS las tablas del store.
export const STORE_SCHEMA = {
  ...orchestrationSchema,
  ...gatewaySchema,
  ...taskSchema,
  ...reviewSchema,
  ...promotionSchema,
};
