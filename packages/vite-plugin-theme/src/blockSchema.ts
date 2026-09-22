export const API_ID_PATTERN = '^[a-z][a-z0-9-]{1,48}$';
export const FIELD_ID_PATTERN = '^[a-z][a-zA-Z0-9]{0,48}$';
export const CATEGORY_PATTERN = '^[a-z][a-z0-9-]{1,30}$';
export const SLOT_ID_PATTERN = '^[a-z][a-z0-9-]{0,47}$';

export const blockJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['apiId', 'name', 'version', 'fields'],
  properties: {
    apiId: { type: 'string', pattern: API_ID_PATTERN },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    description: { type: 'string', maxLength: 300 },
    icon: { type: 'string', minLength: 1 },
    category: { type: 'string', pattern: CATEGORY_PATTERN },
    version: { type: 'integer', minimum: 1 },
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: { $ref: '#/definitions/blockField' },
    },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['groupId', 'name'],
        properties: {
          groupId: { type: 'string', pattern: FIELD_ID_PATTERN },
          name: { type: 'string', minLength: 1, maxLength: 80 },
          defaultOpen: { type: 'boolean' },
        },
      },
    },
    migrations: { type: 'array', items: { $ref: '#/definitions/blockMigration' } },
    slots: { type: 'array', maxItems: 12, items: { $ref: '#/definitions/blockSlot' } },
  },
  definitions: {
    blockMigration: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'renames'],
      properties: {
        version: { type: 'integer', minimum: 2 },
        renames: {
          type: 'array',
          maxItems: 32,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['from', 'to'],
            properties: {
              from: { type: 'string', pattern: FIELD_ID_PATTERN },
              to: { type: 'string', pattern: FIELD_ID_PATTERN },
            },
          },
        },
      },
    },
    blockField: {
      type: 'object',
      additionalProperties: false,
      required: ['fieldId', 'name', 'type'],
      properties: {
        fieldId: { type: 'string', pattern: FIELD_ID_PATTERN },
        name: { type: 'string', minLength: 1 },
        type: { type: 'string', minLength: 1 },
        groupId: { type: 'string' },
        isTitle: { type: 'boolean' },
        localized: { type: 'boolean' },
        default: {},
        description: { type: 'string' },
        helpText: { type: 'string' },
        validators: { type: 'object' },
        metadata: { type: 'object' },
        relation: {
          type: 'object',
          additionalProperties: false,
          required: ['allowedTagIds'],
          properties: {
            allowedTagIds: { type: 'array', minItems: 1, items: { type: 'string' } },
            multiple: { type: 'boolean' },
          },
        },
      },
    },
    blockSlot: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label', 'maxItems'],
      properties: {
        id: { type: 'string', pattern: SLOT_ID_PATTERN },
        label: { type: 'string', minLength: 1, maxLength: 80 },
        description: { type: 'string', maxLength: 240 },
        minItems: { type: 'integer', enum: [0] },
        maxItems: { type: 'integer', minimum: 1, maximum: 20 },
        allowedBlockApiIds: {
          type: 'array',
          maxItems: 50,
          uniqueItems: true,
          items: { type: 'string' },
        },
      },
    },
  },
} as const;
