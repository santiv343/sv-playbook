import { NODE_ERROR_PROPERTY } from './platform.constants.js';

export function nodeErrorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !Reflect.has(error, NODE_ERROR_PROPERTY.CODE)) {
    return undefined;
  }
  return Reflect.get(error, NODE_ERROR_PROPERTY.CODE);
}
