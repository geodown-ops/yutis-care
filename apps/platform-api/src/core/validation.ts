import { BadRequestException } from '@nestjs/common';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/** Validate a request body or query against a Zod schema; 400 with the issues if it does not match. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ code: 'validation_failed', message: z.prettifyError(result.error), issues: result.error.issues });
  }
  return result.data;
}

/** The OpenAPI schema for a Zod schema, for `@ApiBody({ schema })`. */
export function openApiSchema(schema: z.ZodType): SchemaObject {
  const { $schema: _, ...json } = z.toJSONSchema(schema, { io: 'input' });
  return json as SchemaObject;
}
