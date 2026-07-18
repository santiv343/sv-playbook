import { SchemaError } from './core.errors.js';
import type { Schema, ObjectShape } from './core.types.js';

const MIN_NON_EMPTY_STRING_LENGTH = 1;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalField(schema: Schema<unknown>): boolean {
  return '_optional' in (schema as unknown as Record<string, unknown>);
}

export function string(): Schema<string> {
  return {
    parse(value: unknown): string {
      if (typeof value !== 'string') {
        throw new SchemaError([], `expected string, got ${typeof value}`);
      }
      return value;
    },
  };
}

export function nonEmptyString(): Schema<string> {
  return {
    parse(value: unknown): string {
      if (typeof value !== 'string') {
        throw new SchemaError([], `expected string, got ${typeof value}`);
      }
      const trimmed = value.trim();
      if (trimmed.length < MIN_NON_EMPTY_STRING_LENGTH) {
        throw new SchemaError([], 'expected non-empty string');
      }
      return trimmed;
    },
  };
}

export function number(): Schema<number> {
  return {
    parse(value: unknown): number {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new SchemaError([], `expected number, got ${typeof value}`);
      }
      return value;
    },
  };
}

export function boolean(): Schema<boolean> {
  return {
    parse(value: unknown): boolean {
      if (typeof value !== 'boolean') {
        throw new SchemaError([], `expected boolean, got ${typeof value}`);
      }
      return value;
    },
  };
}

export function integer(): Schema<number> {
  return {
    parse(value: unknown): number {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new SchemaError([], `expected integer, got ${typeof value}`);
      }
      return value;
    },
  };
}

export function positiveInteger(): Schema<number> {
  return {
    parse(value: unknown): number {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new SchemaError([], `expected positive integer, got ${JSON.stringify(value)}`);
      }
      return value;
    },
  };
}

export function array<T>(item: Schema<T>): Schema<T[]> {
  return {
    parse(value: unknown): T[] {
      if (!Array.isArray(value)) {
        throw new SchemaError([], `expected array, got ${typeof value}`);
      }
      return value.map((element, index) => {
        try {
          return item.parse(element);
        } catch (err) {
          if (err instanceof SchemaError) {
            throw new SchemaError([String(index), ...err.path], err.detail);
          }
          throw err;
        }
      });
    },
  };
}

function parseField<T>(
  key: string,
  fieldSchema: Schema<T>,
  value: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  const fieldValue = value[key];
  let parsed: T;
  try {
    parsed = fieldSchema.parse(fieldValue);
  } catch (err) {
    if (err instanceof SchemaError) {
      throw new SchemaError([key, ...err.path], err.detail);
    }
    throw err;
  }
  if (!isOptionalField(fieldSchema) || parsed !== undefined) {
    result[key] = parsed;
  }
}

export function object<T extends Record<string, Schema<unknown>>>(
  shape: T,
): Schema<ObjectShape<T>> {
  return {
    parse(value: unknown) {
      if (!isRecord(value)) {
        const got = Array.isArray(value) ? 'array' : typeof value;
        throw new SchemaError([], `expected object, got ${got}`);
      }
      const result = {} as Record<string, unknown>;
      for (const [key, fieldSchema] of Object.entries(shape)) {
        parseField(key, fieldSchema, value, result);
      }
      return result as unknown as ObjectShape<T>;
    },
  };
}

export function optional<T>(schema: Schema<T>): Schema<T | undefined> & { readonly _optional: true } {
  return {
    _optional: true as const,
    parse(value: unknown): T | undefined {
      if (value === undefined || value === null) return undefined;
      return schema.parse(value);
    },
  };
}

export function enu<T extends readonly string[]>(values: T): Schema<T[number]> {
  return {
    parse(value: unknown): T[number] {
      if (typeof value !== 'string') {
        throw new SchemaError([], `expected string, got ${typeof value}`);
      }
      if (!(values as readonly string[]).includes(value)) {
        throw new SchemaError(
          [],
          `expected one of ${values.map((v) => `'${v}'`).join(', ')}, got '${value}'`,
        );
      }
      return value;
    },
  };
}

export function literal<T extends string | number | boolean>(expected: T): Schema<T> {
  return {
    parse(value: unknown): T {
      if (value !== expected) {
        throw new SchemaError([], `expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      return value as unknown as T;
    },
  };
}

export function record<T>(valueSchema: Schema<T>): Schema<Record<string, T>> {
  return {
    parse(value: unknown): Record<string, T> {
      if (!isRecord(value)) {
        throw new SchemaError([], `expected object, got ${typeof value}`);
      }
      const result: Record<string, T> = {};
      for (const [key, val] of Object.entries(value)) {
        try {
          result[key] = valueSchema.parse(val);
        } catch (err) {
          if (err instanceof SchemaError) {
            throw new SchemaError([key, ...err.path], err.detail);
          }
          throw err;
        }
      }
      return result;
    },
  };
}

export function json<T>(schema: Schema<T>): Schema<T> {
  return {
    parse(value: unknown): T {
      if (typeof value !== 'string') {
        throw new SchemaError([], `expected a JSON string, got ${typeof value}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new SchemaError([], 'invalid JSON');
      }
      return schema.parse(parsed);
    },
  };
}

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
