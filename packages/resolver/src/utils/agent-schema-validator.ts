/**
 * Hand-rolled JSON-Schema 2020-12 validator — minimum subset.
 *
 * Why hand-rolled vs Ajv: synthesis pulls no ajv (transitive or direct), and
 * zod isn't a JSON-Schema validator (it can't ingest the JSON-Schema docs
 * that the agent + delegation-policy schemas are authored in). The two
 * schemas in `test/fixtures/agent-verify/` use only the keywords below, so a
 * 100-line validator avoids a top-level dep without losing coverage.
 *
 * Supported keywords:
 *   - type (string|number|integer|boolean|null|object|array)
 *   - const, enum
 *   - pattern (RegExp), format (date-time, uri)
 *   - required, properties, additionalProperties
 *   - items, minItems, maxItems
 *   - minimum, maximum
 *   - minLength, maxLength
 *   - $schema, $id, title, description (informational, ignored for validation)
 *
 * Not supported (intentional): $ref, oneOf/anyOf/allOf/not, dependencies,
 * patternProperties, contains, propertyNames. If a future schema needs
 * these, swap to Ajv at that point.
 */

export interface ValidationError {
  /** JSON-pointer-ish path to the offending value, e.g. `/delegators/0/role`. */
  path: string;
  /** Human-readable description of the violation. */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

type Schema = Record<string, unknown>;

const ISO_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:.+$/;

export function validate(value: unknown, schema: Schema): ValidationResult {
  const errors: ValidationError[] = [];
  validateNode(value, schema, "", errors);
  return { valid: errors.length === 0, errors };
}

function validateNode(
  value: unknown,
  schema: Schema,
  path: string,
  errors: ValidationError[],
): void {
  // type
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t as string))) {
      errors.push({
        path,
        message: `expected type ${types.join("|")}, got ${actualType(value)}`,
      });
      return; // downstream keywords assume the type matches
    }
  }

  // const
  if ("const" in schema) {
    if (!deepEqual(value, schema.const)) {
      errors.push({
        path,
        message: `expected const ${JSON.stringify(schema.const)}`,
      });
    }
  }

  // enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((opt) => deepEqual(value, opt))) {
      errors.push({
        path,
        message: `value not in enum [${schema.enum.map((x) => JSON.stringify(x)).join(", ")}]`,
      });
    }
  }

  if (typeof value === "string") {
    if (typeof schema.pattern === "string") {
      if (!new RegExp(schema.pattern).test(value)) {
        errors.push({ path, message: `does not match pattern ${schema.pattern}` });
      }
    }
    if (typeof schema.format === "string") {
      if (schema.format === "date-time" && !ISO_DATE_TIME_RE.test(value)) {
        errors.push({ path, message: `not a valid date-time` });
      } else if (schema.format === "uri" && !URI_RE.test(value)) {
        errors.push({ path, message: `not a valid uri` });
      }
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push({ path, message: `string shorter than minLength ${schema.minLength}` });
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push({ path, message: `string longer than maxLength ${schema.maxLength}` });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path, message: `value less than minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path, message: `value greater than maximum ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({ path, message: `array shorter than minItems ${schema.minItems}` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push({ path, message: `array longer than maxItems ${schema.maxItems}` });
    }
    if (schema.items && typeof schema.items === "object") {
      for (let i = 0; i < value.length; i++) {
        validateNode(value[i], schema.items as Schema, `${path}/${i}`, errors);
      }
    }
  }

  if (isPlainObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({ path, message: `missing required property "${key}"` });
        }
      }
    }
    const props = (schema.properties as Record<string, Schema> | undefined) ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (k in props) {
        validateNode(v, props[k], `${path}/${k}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}/${k}`, message: `additional property not allowed` });
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        validateNode(v, schema.additionalProperties as Schema, `${path}/${k}`, errors);
      }
    }
  }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isPlainObject(value);
    default:
      return false;
  }
}

function actualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
